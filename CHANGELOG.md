# Changelog

## v1.4.1 — 上架准备（首个 npm 版本）

不改行为，只补发布需要的元数据。

- `engines.dsh`: `>=0.2.0-0 <0.3.0`。宿主会读这个字段（写错会被启动时拒绝），
  下限带 `-0` 是为了让 0.2.x 的 prerelease（比如 0.2.1-rc.3）也满足范围；
  已在 0.2.1-rc.3 上实测可以正常装载。
- `icon`: `./assets/icon.svg`，插件管理里显示用。
- README 安装命令改成 npm 优先（`dsh plugin --profile web add dsh-sketch`），
  GitHub 源码安装作为备选；补了兼容性说明。
- `files` 加上 `assets`，图标会跟着包走。

---

## v1.4.0 — 深色外观

深色主题下画布面板一直是白的 —— 因为样式里写的几个变量名**宿主根本没有**。
这次换成宿主真正提供的 token。

### 修复

- 原来的 `--dsw-alias-bg-primary`、`--dsw-alias-bg-secondary`、
  `--dsw-alias-accent-primary`、`--dsw-alias-status-success/danger`、
  `--dsw-alias-label-on-accent` 在宿主里一个都不存在，于是全部落到硬编码的浅色兜底，
  深色主题下就成了「深色界面里一块白板」。
- 换成真实存在的 token：`--dsw-alias-bg-base` / `bg-layer-1`、`label-primary` /
  `label-secondary`、`border-l1` / `border-l2`、`interactive-bg-hover`、
  `state-success-primary` / `state-error-primary`、`button-primary-fill` /
  `button-primary-hover`、`label-primary-inverted`。
- 边框、hover、遮罩这类写死 `rgba(0,0,0,…)` 的改成中性灰或跟着 token 走，亮暗都成立。

### 不变

- **画布仍是白纸**。导出会作为图片附件进对话，深色底 + 黑笔在聊天里看不清，
  所以绘图区固定白底，只让面板跟随主题。
- 交互、调色盘、线宽、撤销 / 清空、导入 / 降级下载都没动。

### 验证

无头浏览器分别在 `prefers-color-scheme: light` / `dark` 下打开画布截图对比，
两种主题都对；`docs/canvas-dark.png` 是深色下的样子。

---

## v1.3.1 — README 补截图和功能清单

只改文档，没有代码变动。

- `docs/menu.png`：「+」菜单里的「画一张」，带图标和右侧说明
- `docs/canvas.png`：点开之后的画布
- README 新增「截图」「功能」两节，把这一版到底能给什么写清楚：
  「+」菜单入口 / `/sketch`、画布（5 色 4 档线宽、撤销清空、Esc 关闭）、
  PNG 作为图片附件进输入框、附件被拒时降级下载、跟随界面语言、零依赖纯客户端
- `package.json` 的 `files` 加上 `docs`，发 npm 时截图跟着走

---

## v1.3.0 — 改名为 dsh-sketch

包名 `dsh-sketch-draft` → **`dsh-sketch`**，仓库同步改为
<https://github.com/dyguests/dsh-sketch>。

### 为什么改

1. **"draft" 不再成立**。在 dsh 里 draft 指输入框里那条没发出的消息；上游用它，是因为
   它把 PNG 落盘、把路径写进草稿、还会按模型是否收图切模型。这些在 1.1.0 里全删了，
   现在只剩「画 → 挂成附件」，没有草稿文本。
2. **避不开的重名**。`dsh-sketch-draft` 这个 npm 名属于上游，而且是**在 0.2.1 上必然
   报错那一版**：`dsh plugin add dsh-sketch-draft` 装到坏的，`github:dyguests/...` 才
   是好的。同一个名字两种结果，谁照着名字装谁踩坑。

### 变更

- `package.json` name、`cordis.patch.yml` 的 loader id、客户端 bundle id
  （`window.__ModuleLoader__.load({ id })`）、插槽 id、CSS 类前缀（`dsd-` → `dsk-`）
  全部跟上。
- 图标、说明、`/sketch` 触发名都不变 —— 本来就叫 sketch。

### 升级

```sh
dsh plugin --profile web remove dsh-sketch-draft
dsh plugin --profile web add github:dyguests/dsh-sketch
```

装完重启 dsh（包名变了，宿主半区要重新装载）。

---

## v1.2.1 — 菜单项补上图标和说明

上一版进「+」菜单后只显示一行「Sketch」，左边缺图标、右边缺说明，跟旁边的「文件 /
目标 / 计划」不齐。

### 修复

- **图标**：宿主只渲染传进去的 `icon` 组件，不自带就是空的。改成插件自己带一个铅笔
  SVG（`size` 由菜单传入，14px），不再依赖 `@deepseek-ai/dsh-client-ui-primitives`
  能不能解析到。
- **说明**：补 `description`，菜单右侧显示「画一张草图，作为图片附件放进输入框」。
- **语言**：原来取 `navigator.language`，桌面端常年是 `en-US`、界面却是中文，于是
  中文界面里显示成 "Sketch"。改成读宿主同步的 `<html lang>`（切语言时会跟着变），
  拿不到才回退 `navigator`。

---

## v1.2.0 — 入口收进输入框的「+」菜单

原来输入框旁边单独占一个铅笔按钮；现在它变成「+」菜单里的一项，和「文件 / 目标 /
计划」并列，输入框那排又干净了一点。

### 变更

- 注册方式从「往 `conversation.input.left` 插槽里挂按钮」改成「往 `commandUi` 注册一个
  `ui.kind: "action"` 的命令」——和 ui-conversation 注册「文件」用的是同一个注册点。
- 菜单里显示为「画一张 / Sketch」，带铅笔图标；`/sketch` 也能直接触发。
- 画布本身没变（5 色 / 4 档线宽 / 撤销 / 清空 / `Esc` 关闭 / 导入为附件 / 失败降级下载）。
- 插槽里只剩一个渲染 `null` 的挂载点：菜单项负责唤起，画布用 portal 挂到 `body`。
  如果宿主将来没有 `commandUi`，它会退回成原来的独立按钮（不会静默消失）。

### 已知边界

- 「添加」分组（文件 / 目标 / 计划 / 反馈）是宿主写死的固定名单，第三方插件进不去；
  本项落在「指令」分组末尾，需要往下滚一点。
- 仍然是纯客户端交付，不判断当前模型收不收图。

---

## v1.1.0 — 换掉交付路径，让它在 dsh 0.2.1 上真的能导入

**这是一个 fork**（https://github.com/dyguests/dsh-sketch-draft），基于上游 LLYlab 的
`dsh-sketch-draft` 1.0.0。上游的 GitHub 仓库 `LLYlab/DSHSketchDraft` 已经找不到了，
基线取自 npm 上的发布包（<https://www.npmjs.com/package/dsh-sketch-draft>），
详见 README 的「源码来源」。上游的设计
（实时判定模型是否收图、自动切视觉模型）保留在 git 历史里，本版只是把**已经失效的
那一层**换掉。

### 修复

- **「无法确认当前模型是否支持图片（support 端点不可用）」不再出现**。
  上游客户端调 `connection.rpc.call("/api", "dshSketchDraft/support", …)`，而 dsh
  0.2.1 的 RPC 在发出前校验 endpoint（`/^[A-Za-z0-9_$.-]+$/`，**不允许斜杠**），
  调用被 `assertTarget` 直接拒绝，`support` 永远拿不到，导入按钮也就无从判断该走
  「挂附件」还是「存 PNG」。
  现在不再向宿主问任何事，交付改走客户端本来就有的两个 API：
  `conversation.createDrafts(sessionId, [file])` → `composer.shell(sessionId).addAttachments(ids)`。

- **导入失败不再静默**：附件通道不可用（服务缺失 / `addAttachments` 返回 false）时，
  回退为**下载 PNG**，并在画布底部如实说明原因，不谎报成功。

### 移除（随之不再需要）

- 宿主半区的四个 typert 端点（`status` / `support` / `save` / `routes`）——
  `lib/index.js` 现在是空壳，只用来让本包成为 profile 的一层 bundle。
- 「实时判定 + 自动切换视觉模型 + 一键切回」—— 依赖上面那套端点，一并下线。
  以后如果有人按 0.2.x 的协议重接 typert，这块可以补回来。
- `<workspace>/.dsh-drafts/*.png` 落盘 —— 现在只进输入框，不写磁盘。
- 第三方依赖（`@deepseek-ai/dsh-typert-protocol`、`schemastery`）—— 本版零依赖。

### 新增

- `test/bundle.test.mjs`：用假的 `__ModuleLoader__` 按浏览器同一条路径装载
  `lib/client.js`，断言它只注册 `conversation.input.left`、只用 `createDrafts` /
  `addAttachments`，并且**代码里不出现任何 RPC / typert 调用** —— 这条守卫就是冲着
  这次的回归写的。`pnpm test` 或 `node --test test/bundle.test.mjs`。

### 升级注意

- 版本号跳到 **1.1.0**：`dsh plugin remove dsh-sketch-draft` 再装一次，然后重启 dsh。
- 画布逻辑尺寸仍是 1000×620，交互不变（5 色 / 4 档线宽 / 撤销 / 清空 / Esc 关闭）。

---

## v1.0.0 — 从 DET 拆出来的第一版（上游 LLYlab）

把 DET（dsh-essential-tools）的草图功能拆成独立可安装、可发布的包 `dsh-sketch-draft`。
拆的理由：这块**不需要 DET 的任何东西**（只依赖宿主的 `llm` / `sessions` /
`sessionProjections` / `attachments` 四个公共服务），独立发布之后既能单独用，也让
这条链上的修复不必跟着大插件发版。

### 新增（相对 DET 里那份的实现）

- **`liveModelSelection`：判定改成真正的「实时」**。
  以前只读会话日志里最后一条 `request/header` —— 那是**已经跑过**的那一轮的模型。
  用户在模型选择器里换了模型之后，会话先落一条 `model/selection`、投影里出现
  `pending`，要等下一轮请求才会被消费；只看 `request/header` 就永远慢一拍，
  于是「当前模型能收图」判断错误，发送时才被宿主以
  `MODEL_DOES_NOT_SUPPORT_IMAGES` 顶回来。
  现在优先读会话投影 `modelSelection` 的 `pending ?? lastUsed`，再退事件日志
  （最后一条 `model/selection` 若晚于最后一条 `request/header` 就采信它），
  最后才退宿主默认模型。

- **`modelAcceptsImages`：收不收图只认宿主模型表的 `inputModalities`**。
  拿不到模型信息就按「收不了」处理（退回存 PNG + 插路径），宁可在导入前说清楚，
  也不要等到发送时才被拒。`support` 与 `routes` 共用这一条实现，两处判定不会漂移。

- **附件白名单也参与判定**：部署的 `attachments.imageLimits` 不收 `image/png` 时，
  即使模型能看图也不当作「可作为图片注入」，并如实说明原因。

- **客户端每次点「导入」都重新问一遍宿主**（不再复用打开画布那一刻的结论）。
  画布开着的时候换模型，立刻就被看见。

- **交付不撒谎**：`allowImage` 为真却挂不上附件（客户端服务缺失 /
  `addAttachments` 拒绝）时，如实回报 `imageFailure` / `delivered`，
  按钮上显示「⚠ 已存成 PNG：…（作为图片附件失败：…）」，不再谎报「已作为图片注入」。

- **落盘路径收窄 + 体积上限 + 同名不覆盖**：只允许写进本会话工作区
  （外部 `dir` 忽略并如实回报）；非 PNG（魔数校验）与超过 `maxBytes` 的一律拒绝；
  同秒连画两张自动加 `-2` / `-3` 后缀，不覆盖。

- **撤销真的能撤**：历史栈改为在**落笔之前**抓快照（并记住当时的「画布是否为空」）。
  旧实现在落笔**之后**才入栈，于是第一次「撤销」拿回的是刚画完的那张 ——
  看起来毫无反应，而且第一笔永远撤不掉。

- **与 DET 的单拥有者约定**：DET 在场且它的「草图导入」开着时，本包读 DET 的
  `subordinateGrants().grants.sketchDraft` 并**主动让位**（一个插槽都不注册），
  所以输入框旁永远只有一个铅笔。反过来 DET 不需要知道本包存在 ——
  让位方向只有一条，不会互相抢。`deferToDet` 可选 `auto` / `never` / `always`。

- **不搅别人的界面**：客户端不做整页刷新（DET 里那份曾用
  `window.location.reload()` 让刚启停的插件界面生效，代价是把自己的界面与操作现场
  一起重置）；样式全部限定在 `dsd-*` 前缀下，DOM 与其它插件互不干扰。

### 测试

`tests/sketch-draft.test.mjs` —— **85 项断言**：包身份与 `apply` 装载契约、
`liveModelSelection` 的四种来源与优先级、`modelAcceptsImages` / 附件白名单、
`support` 的合成结论与原因、`save` 的路径收窄 / 魔数 / 体积 / 同名、
`routes` 的筛选、与 DET 的让位矩阵（含 DET 抛错时不失效）、
client bundle 真执行（含「被让位时不注册按钮」），以及防止回退的源码守卫。
