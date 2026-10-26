// dsh-sketch-draft — Host 半区
//
// 「现画一张草图，直接注入对话」的独立插件。从 DET（dsh-essential-tools）的草图
// 功能里拆出来单独发布，因为它其实**不需要 DET 的任何东西**：
//
//   · 画布在前端（浏览器），落盘 + 判定在宿主；
//   · 判定只依赖宿主的三个公共服务：llm（模型表）、sessions/sessionProjections
//     （这个会话此刻到底用哪个模型）、attachments（附件白名单）。
//
// 拆包之后有三个直接好处：
//   1. 不想装 DET 的人也能用（独立可用，零 DET 依赖）；
//   2. DET 可以卸掉自己那份（避免同一个按钮有两份实现）；
//   3. 草图这条链上的修复能独立发版，不必跟着 DET 的大版本走。
//
// 设计要点（都是踩出来的）：
//
//   ★ **实时**判定「当前模型收不收图」：模型来自会话投影的 `pending ?? lastUsed`
//     （用户在模型选择器里换了模型 → 落一条 model/selection → 投影出现 pending），
//     而不是会话日志里最后一条 request/header（那是**已经跑过**的那一轮）。只看
//     request/header 会慢一拍，于是「当前模型能收图」判断错误，发送时才被宿主以
//     MODEL_DOES_NOT_SUPPORT_IMAGES 顶回来 —— 这正是用户报的
//     「自动切换视觉模型居然不是实时检查模型表判定的」。
//   · 收不收图只认宿主模型表的 `inputModalities`，拿不到就按「收不了」处理
//     （宁可退回存 PNG，也不要在发送时才失败）。
//   · 落盘路径被收窄到「本会话工作区」，同名不覆盖。
//   · 与 DET 的**单拥有者**约定：DET 在场且它的「草图导入」开着时，本包主动让位
//     （见 detGrants / suppressed），避免输入框旁冒出两个铅笔按钮。

import z from "@deepseek-ai/schemastery";
import { existsSync, promises as fsp } from "node:fs";
import { join, resolve } from "node:path";
import { homedir } from "node:os";
import { TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

/** 包名 / Cordis 服务键 / typert 命名空间（三者一致，便于对账）。 */
const PLUGIN_NAME = "dsh-sketch-draft";
/** DET 的服务键与包名（用于「单拥有者」让位判定）。 */
const DET_SERVICE = "dshEssentialTools";
const DET_PLUGIN_NAME = "dsh-essential-tools";

/** 端点清单（host 与 client 各持一份语义；这里也是 typert 描述符的唯一来源）。 */
const METHOD_NAMES = ["status", "support", "save", "routes"];

/**
 * 只做「安全取服务」这一件事：取值失败 / 服务缺失 / 服务自身抛错一律 undefined。
 * （与 DET 的 adapt.js 同一纪律：单一子能力失败不得拖垮整体。本包独立发布，
 *   所以不复制整张服务名表，只在这里收口 `ctx.get`。）
 */
function svcOf(ctx, name) {
  if (!ctx || typeof ctx.get !== "function") return undefined;
  try {
    const value = ctx.get(name);
    return value === null ? undefined : value;
  } catch (e) {
    return undefined;
  }
}

/** 时间戳（草图默认文件名）。 */
function stamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
}

/** DSH_HOME（默认 ~/.dsh）；没有会话工作区时草图退到这里。 */
function dshHome() {
  const env = typeof process !== "undefined" && process.env ? process.env.DSH_HOME : "";
  return env && env !== "" ? env : join(homedir(), ".dsh");
}

const Config = z.object({
  /** 总开关：关掉后端点仍注册，但客户端不会挂按钮（便于「先装后开」）。 */
  enabled: z.boolean().default(true),
  /**
   * 让位给 DET 的策略：
   *   'auto'  —— DET 在场且它的「草图导入」开着时，本包让位（默认；避免两个按钮）
   *   'never' —— 永远不让位（想用本包、且已经把 DET 的草图关掉时更明确）
   *   'always'—— 只要 DET 在场就让位（哪怕 DET 关了自己的草图）
   */
  deferToDet: z.string().default("auto"),
  /** 草图落盘子目录名（相对会话工作区）。 */
  dirName: z.string().default(".dsh-drafts"),
  /** 画布逻辑尺寸（同时决定落盘 PNG 的像素预算；默认落在视觉模型常见预算内）。 */
  canvasWidth: z.number().default(960),
  canvasHeight: z.number().default(600),
  /** 单张草图字节上限（PNG 兜底，防止误传巨图）。 */
  maxBytes: z.number().default(8 * 1024 * 1024),
});

class SketchDraftService extends TypertRemoteService {
  constructor(ctx, config) {
    super(ctx, PLUGIN_NAME);
    this.config = config;
  }

  /** 诊断/展示用信息。 */
  info() {
    return {
      owner: PLUGIN_NAME,
      name: PLUGIN_NAME,
      dirName: this.config.dirName,
      canvas: { width: this.config.canvasWidth, height: this.config.canvasHeight },
    };
  }

  /** 草图缓存目录（没有会话工作区时退到这里）。 */
  get cacheDir() {
    return join(dshHome(), "sketch-draft");
  }

  /** 本会话的工作区根目录（拿不到返回空串）。 */
  async workspaceRoot(sessionId) {
    if (!sessionId) return "";
    try {
      const sessions = svcOf(this.ctx, "sessions");
      const session = sessions && typeof sessions.get === "function" ? sessions.get(sessionId) : null;
      const cwd = session && ((session.header && session.header.cwd) || (session.meta && session.meta.cwd));
      if (typeof cwd === "string" && cwd !== "") return cwd;
    } catch (e) { /* 尽力而为 */ }
    return "";
  }

  /** 某个会话最近一次请求用过的事件列（拿不到返回空数组）。 */
  async sessionEventsOf(sessionId) {
    const sessions = svcOf(this.ctx, "sessions");
    const session = sessions && typeof sessions.get === "function" && sessionId ? sessions.get(sessionId) : null;
    if (!session) return [];
    try {
      if (typeof session.snapshotEvents === "function") return Array.from(session.snapshotEvents());
      if (typeof session.ownEvents === "function") return Array.from(session.ownEvents());
      if (Array.isArray(session.events)) return session.events.slice();
    } catch (e) { /* 尽力而为 */ }
    return [];
  }

  /**
   * 「这个会话下一次请求会用哪个模型」——**实时**事实源。
   *
   * 1) 会话投影 modelSelection 的 `pending ?? lastUsed`（pending = 用户刚选、还没跑）
   * 2) 事件日志：最后一条 model/selection 若晚于最后一条 request/header 就采信它
   * 3) 宿主默认模型
   *
   * @returns {Promise<{provider:string, model:string, source:(string|null), live:boolean}>}
   */
  async liveModelSelection(sessionId) {
    // 1) 投影
    try {
      const projections = svcOf(this.ctx, "sessionProjections");
      const sessions = svcOf(this.ctx, "sessions");
      const session = sessions && typeof sessions.get === "function" && sessionId ? sessions.get(sessionId) : null;
      if (projections && typeof projections.stateOf === "function" && session) {
        const state = projections.stateOf(session, "modelSelection");
        const pending = state && state.pending;
        if (pending && pending.provider && pending.model) {
          return { provider: String(pending.provider), model: String(pending.model), source: "projection-pending", live: true };
        }
        const lastUsed = state && state.lastUsed;
        if (lastUsed && lastUsed.provider && lastUsed.model) {
          return { provider: String(lastUsed.provider), model: String(lastUsed.model), source: "projection-lastUsed", live: true };
        }
      }
    } catch (e) { /* 投影单元未注册 → 退事件日志 */ }

    // 2) 事件日志
    try {
      const events = await this.sessionEventsOf(sessionId);
      if (Array.isArray(events) && events.length > 0) {
        let selected = null;
        let ran = null;
        for (let i = events.length - 1; i >= 0; i--) {
          const ev = events[i];
          if (!ev) continue;
          if (!selected && ev.type === "model/selection") {
            const d = ev.data || {};
            if (d.provider && d.model) selected = { provider: String(d.provider), model: String(d.model), seq: Number(ev.seq) || 0 };
          }
          if (!ran && ev.type === "request/header") {
            const cfg = ev.data && ev.data.header && ev.data.header.config;
            if (cfg && cfg.provider && cfg.model) ran = { provider: String(cfg.provider), model: String(cfg.model), seq: Number(ev.seq) || 0 };
          }
          if (selected && ran) break;
        }
        if (selected && (!ran || selected.seq > ran.seq)) {
          return { provider: selected.provider, model: selected.model, source: "event-model-selection", live: true };
        }
        if (ran) return { provider: ran.provider, model: ran.model, source: "request/header", live: false };
        if (selected) return { provider: selected.provider, model: selected.model, source: "event-model-selection", live: true };
      }
    } catch (e) { /* 尽力而为 */ }

    // 3) 宿主默认模型
    const def = svcOf(this.ctx, "agentDefaultModel");
    if (def && typeof def.currentSelection === "function") {
      try {
        const sel = def.currentSelection();
        if (sel && sel.provider && sel.model) {
          return { provider: String(sel.provider), model: String(sel.model), source: "default", live: false };
        }
      } catch (e) { /* 尽力而为 */ }
    }
    return { provider: "", model: "", source: null, live: false };
  }

  /**
   * **实时**问模型表：这条路由收不收图片。判据只有 `inputModalities` 含 `image`。
   * @returns {Promise<{images:boolean, known:boolean, modalities:string[], error:string}>}
   */
  async modelAcceptsImages(provider, model) {
    const llm = svcOf(this.ctx, "llm");
    if (!provider || !model) return { images: false, known: false, modalities: [], error: "没有可判定的模型路由" };
    if (!llm || typeof llm.resolveModelInfo !== "function") {
      return { images: false, known: false, modalities: [], error: "宿主 llm 服务不可用（无法读模型表）" };
    }
    try {
      const info = await llm.resolveModelInfo(provider, model);
      const modalities = info && info.inputModalities ? Array.from(info.inputModalities).map(String) : [];
      return { images: modalities.indexOf("image") !== -1, known: true, modalities, error: "" };
    } catch (e) {
      return { images: false, known: false, modalities: [], error: String(e && e.message ? e.message : e) };
    }
  }

  /** 部署侧附件白名单是否收 image/png（拿不到就按「收」处理，交给宿主最终裁决）。 */
  attachmentAllowsPng() {
    try {
      const attachments = svcOf(this.ctx, "attachments");
      const limits = attachments && attachments.imageLimits;
      if (limits && Array.isArray(limits.mediaTypes)) {
        const list = limits.mediaTypes.map(String);
        if (list.length > 0) return list.some((t) => t === "image/png" || t === "image/*");
      }
    } catch (e) { /* 没有 attachment 服务 → 不拦 */ }
    return true;
  }

  /**
   * 与 DET 的**单拥有者**约定：DET 在场且它的草图导入开着时，本包让位。
   *
   * 读的是 DET 的 `subordinateGrants()`（dsh-essential-tools 与下辖插件之间唯一的
   * 约定面），`grants.sketchDraft === true` 表示「这块由 DET 统一呈现」。
   * @returns {Promise<{present:boolean, granted:boolean, reason:string}>}
   */
  async detGrants() {
    const mode = String(this.config.deferToDet || "auto");
    if (mode === "never") return { present: false, granted: false, reason: "配置为永不让位（deferToDet: never）" };
    const det = svcOf(this.ctx, DET_SERVICE);
    if (!det || typeof det.subordinateGrants !== "function") {
      return { present: false, granted: false, reason: "DET 不在场" };
    }
    if (mode === "always") return { present: true, granted: true, reason: "配置为只要 DET 在场就让位（deferToDet: always）" };
    try {
      const g = await det.subordinateGrants();
      const granted = !!(g && g.grants && g.grants.sketchDraft === true);
      return {
        present: true,
        granted,
        reason: granted
          ? "DET 在场且它的「草图导入」开着：本包让位，输入框旁只留 DET 那一个按钮"
          : "DET 在场但它没有接管草图（总开关关闭 / dltDraft 关闭 / det.subordinate 关闭）：本包全责",
      };
    } catch (e) {
      return { present: true, granted: false, reason: "读取 DET 声明失败（按本包全责处理）：" + String(e && e.message ? e.message : e) };
    }
  }

  /** 端点：这个包此刻是不是在「让位」。 */
  async status() {
    const det = await this.detGrants();
    const enabled = this.config.enabled !== false;
    return {
      ok: true,
      ...this.info(),
      enabled,
      suppressed: !enabled || det.granted,
      suppressedBy: !enabled ? "config.enabled=false" : (det.granted ? DET_PLUGIN_NAME : ""),
      det: { present: det.present, granted: det.granted, reason: det.reason },
      llmAvailable: !!svcOf(this.ctx, "llm"),
    };
  }

  /**
   * 端点：这个会话当前的模型是否接受图片输入 —— 全部**实时**取。
   * 客户端每次点「导入」都会重新问，所以画布开着时换模型也立刻按新模型判断。
   */
  async support(args = {}) {
    const sessionId = args && args.sessionId ? String(args.sessionId) : "";
    const route = await this.liveModelSelection(sessionId);
    const probe = await this.modelAcceptsImages(route.provider, route.model);
    const pngOk = this.attachmentAllowsPng();
    const det = await this.detGrants();
    const images = probe.images && pngOk;
    let reason = "";
    if (!probe.images) {
      reason = probe.error
        ? `模型信息读取失败（${probe.error}）：按不支持图片处理（存 PNG + 路径）`
        : (route.provider && route.model
          ? `当前模型 ${route.model} 未声明图片输入（inputModalities=${probe.modalities.length ? probe.modalities.join("/") : "未声明"}）：草图会存成 PNG 并把路径插进输入框`
          : "取不到当前会话的模型路由：按不支持图片处理（存 PNG + 路径）");
    } else if (!pngOk) {
      reason = "本部署的附件服务不收 image/png：草图会存成 PNG 并把路径插进输入框";
    }
    return {
      ok: true,
      sessionId,
      images,
      provider: route.provider,
      model: route.model,
      routeSource: route.source,
      routeLive: route.live === true,
      modalities: probe.modalities,
      modelKnown: probe.known,
      pngAllowed: pngOk,
      suppressed: this.config.enabled === false || det.granted,
      reason,
    };
  }

  /**
   * 端点：草图落盘（PNG）。默认目录 = <会话工作区>/<dirName>。
   * 路径被收窄到本会话工作区；同名不覆盖。
   */
  async save(args = {}) {
    const raw = String((args && (args.dataUrl || args.data)) || "");
    if (raw === "") return { ok: false, error: "缺少草图数据（dataUrl / base64）" };
    const comma = raw.indexOf(",");
    const base64 = /^data:/i.test(raw) ? raw.slice(comma + 1) : raw;
    let bytes;
    try {
      bytes = Buffer.from(base64, "base64");
    } catch (e) {
      return { ok: false, error: `草图 base64 解析失败：${e && e.message ? e.message : e}` };
    }
    if (bytes.length < 8 || bytes.readUInt32BE(0) !== 0x89504e47 || bytes.readUInt32BE(4) !== 0x0d0a1a0a) {
      return { ok: false, error: "草图数据不是合法 PNG（只接受画布导出的 PNG）" };
    }
    const limit = Number(this.config.maxBytes) > 0 ? Number(this.config.maxBytes) : 8 * 1024 * 1024;
    if (bytes.length > limit) {
      return { ok: false, error: `草图过大（${bytes.length} 字节 > 上限 ${limit}）；降低画布尺寸或线宽重试` };
    }
    const sessionId = args && args.sessionId ? String(args.sessionId) : "";
    const workspace = await this.workspaceRoot(sessionId);
    const rootResolved = workspace ? resolve(workspace) : "";
    // args.dir：只有当它就是本会话工作区（或其中子目录）时才认；否则忽略并如实记录。
    let rejectedDir = "";
    let base = rootResolved;
    if (args && args.dir) {
      const wanted = resolve(String(args.dir));
      const inside = rootResolved !== "" &&
        (wanted.toLowerCase() === rootResolved.toLowerCase() ||
          wanted.toLowerCase().startsWith((rootResolved + "\\").toLowerCase()));
      if (inside) base = wanted;
      else rejectedDir = wanted;
    }
    const dirName = String(this.config.dirName || ".dsh-drafts");
    const dir = base ? join(base, dirName) : join(this.cacheDir, "drafts");
    let name = String((args && args.name) || `sketch-${stamp()}.png`).replace(/[\\/:*?"<>|]+/g, "_");
    if (!/\.png$/i.test(name)) name += ".png";
    let path = join(dir, name);
    try {
      await fsp.mkdir(dir, { recursive: true });
      if (existsSync(path)) {
        const stem = name.replace(/\.png$/i, "");
        for (let i = 2; i < 100; i++) {
          const candidate = join(dir, `${stem}-${i}.png`);
          if (!existsSync(candidate)) { path = candidate; name = `${stem}-${i}.png`; break; }
        }
      }
      await fsp.writeFile(path, bytes);
    } catch (e) {
      return { ok: false, error: `草图写入失败：${e && e.message ? e.message : e}` };
    }
    const rel = base && path.toLowerCase().startsWith((base + "\\").toLowerCase())
      ? path.slice(base.length + 1).replace(/\\/g, "/")
      : null;
    return {
      ok: true, dir, path, rel, name, bytes: bytes.length, sessionId, cwd: base || null,
      ...rejectedDir ? { dirIgnored: rejectedDir, dirIgnoredReason: "不在本会话工作区内，已改用默认目录" } : {},
    };
  }

  /**
   * 端点：哪些模型能**收图片**（「切到视觉模型 → 作为图片附件注入」用它）。
   * 逐个模型**实时**问宿主模型表的 inputModalities；浏览器端拿不到模态表，只能问宿主。
   */
  async routes(args = {}) {
    const llm = svcOf(this.ctx, "llm");
    const list = [];
    const failures = [];
    if (!llm || typeof llm.listProviders !== "function") {
      return { ok: false, error: "未配置 LLM 适配器（设置 → 模型）", routes: list, failures };
    }
    let providers = [];
    try { providers = llm.listProviders() || []; } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e), routes: list, failures };
    }
    for (const prov of providers) {
      let models = [];
      try { models = (await llm.listModels(prov.id)) || []; } catch (e) {
        failures.push({ provider: prov.id, error: String(e && e.message ? e.message : e) });
        continue;
      }
      for (const m of models) {
        const probe = await this.modelAcceptsImages(prov.id, m.id);
        if (!probe.images) continue;
        list.push({ provider: prov.id, model: m.id, name: m.name || m.id });
      }
    }
    const sessionId = args && args.sessionId ? String(args.sessionId) : "";
    let current = null;
    if (sessionId !== "") {
      try { current = await this.liveModelSelection(sessionId); } catch (e) { current = null; }
    }
    return { ok: true, current, routes: list, failures };
  }
}

/** 构造 typert strict 描述符（src-json codec，免 schema）。 */
function buildInvocations() {
  return METHOD_NAMES.map((method) => ({
    id: "dsd-" + method,
    service: PLUGIN_NAME,
    namespace: PLUGIN_NAME,
    method,
    parameters: [{ name: "args", wire: "args", source: "json", codec: { mode: "src-json" } }],
    result: { mode: "src-json" },
    invocation: { kind: "direct" },
  }));
}

const name = PLUGIN_NAME;
/** typert 是硬依赖（注册端点）；其余服务一律 ctx.get 可选读取。 */
const inject = ["typert"];

/**
 * 插件主体。返回服务实例（Cordis 会把它登记在 ctx[PLUGIN_NAME] 上）。
 * @param ctx - 插件上下文（typert 已注入）。
 * @param config - 校验后的配置。
 */
function apply(ctx, config) {
  const service = new SketchDraftService(ctx, config);
  ctx.typert.register({
    package: PLUGIN_NAME,
    face: "host",
    model: {},
    schemas: [],
    invocations: buildInvocations(),
  });
  return service;
}

export { Config, SketchDraftService, apply, inject, name, METHOD_NAMES, PLUGIN_NAME, DET_SERVICE };
export default { name, inject, Config, apply };
