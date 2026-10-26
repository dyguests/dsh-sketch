// dsh-sketch-draft — Client 半区（浏览器 bundle）
//
// 输入框「+」旁边的一个小铅笔按钮：点开画布 → 画一张 → 作为**图片附件**注入输入框。
// 当前模型不收图时，先问宿主哪些模型能看图，切过去再注入，并给一个「切回 <原模型>」。
//
// 与 DET 的关系（单拥有者）：DET 在场且它的「草图导入」开着时，本包**不注册按钮**
// （由 dshSketchDraft/status 回报 suppressed），所以输入框旁永远只有一个铅笔。
// 反过来，DET 不需要知道本包存在 —— 让位方向只有一条，不会互相抢。
//
// 这个 bundle 是**预打包产物**：宿主 dsh-client-modules 用 lazy CJS 模型装载它，
// 并有 build-time bundle purity gate —— `require` 只解析图里的外部依赖，
// **相对导入不会被解析**。所以这里是自包含的：不 import 任何本包其它文件。
// 类名一律 `dsd-` 前缀，样式自带 `data-plugin-css` 归属，不碰别的插件的 DOM/CSS。

window.__ModuleLoader__.load({
  id: "dsh-sketch-draft",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var ReactDOM = require("react-dom");

    /** 客户端服务名表（唯一归属地）。 */
    var CLIENT_SERVICE = {
      connection: "connection",
      modelDirectories: "modelDirectories",
      conversation: "conversation",
    };
    var CLIENT_INJECT = ["slots", "sessions"];

    var NS = "dshSketchDraft";
    var PLUGIN_NAME = "dsh-sketch-draft";

    // ── 样式（只作用于 dsd-* 选择器；data-plugin-css 防重复注入）────────────
    var CSS = "" +
      ".dsd-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;" +
      "border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary);cursor:pointer;flex:none}" +
      ".dsd-btn:hover{background:var(--dsw-alias-interactive-bg-hover);color:var(--dsw-alias-label-primary)}" +
      ".dsd-btn:focus-visible{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:2px}" +
      ".dsd-btn[disabled]{opacity:.45;cursor:default}" +
      ".dsd-mini{font:inherit;font-size:11.5px;padding:3px 8px;border:1px solid var(--dsw-alias-border-l2);border-radius:6px;" +
      "background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);cursor:pointer}" +
      ".dsd-mini:hover{background:var(--dsw-alias-interactive-bg-hover)}" +
      ".dsd-mini[disabled]{opacity:.45;cursor:default}" +
      ".dsd-mini-on{outline:2px solid var(--dsw-alias-brand-primary);outline-offset:1px}" +
      ".dsd-on{background:var(--dsw-alias-brand-primary);border-color:var(--dsw-alias-brand-primary);color:#fff}" +
      ".dsd-ok{color:var(--dsw-alias-state-success-primary)}" +
      ".dsd-err{color:var(--dsw-alias-state-error-primary);word-break:break-word}" +
      ".dsd-note{color:var(--dsw-alias-label-tertiary)}" +
      ".dsd-mask{position:fixed;inset:0;z-index:9997;background:rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center}" +
      ".dsd-panel{width:min(920px,94vw);max-height:92vh;display:flex;flex-direction:column;gap:8px;padding:10px 12px 12px;" +
      "border:1px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1);" +
      "color:var(--dsw-alias-label-primary);box-shadow:0 12px 40px rgba(0,0,0,.45);font-size:13px}" +
      ".dsd-head{display:flex;align-items:center;gap:8px;font-size:12.5px;font-weight:600}" +
      ".dsd-hint{margin-left:auto;font-weight:400;font-size:11px;color:var(--dsw-alias-label-tertiary);max-width:64%;text-align:right}" +
      ".dsd-tools{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding-bottom:6px;border-bottom:1px solid var(--dsw-alias-border-l1)}" +
      ".dsd-sw{width:20px;height:20px;padding:0;border-radius:999px;border:1px solid var(--dsw-alias-border-l2);cursor:pointer}" +
      ".dsd-stage{display:flex;align-items:center;justify-content:center;background:var(--dsw-alias-bg-base);" +
      "border:1px solid var(--dsw-alias-border-l1);border-radius:10px;overflow:hidden}" +
      ".dsd-canvas{display:block;width:100%;height:auto;max-height:60vh;background:#fff;touch-action:none;cursor:crosshair}" +
      ".dsd-foot{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--dsw-alias-label-secondary)}";

    function ensureStyles() {
      if (typeof document === "undefined") return;
      if (document.querySelector('style[data-plugin-css="' + PLUGIN_NAME + '"]')) return;
      var el = document.createElement("style");
      el.setAttribute("data-plugin", PLUGIN_NAME);
      el.setAttribute("data-plugin-css", PLUGIN_NAME);
      el.textContent = CSS;
      document.head.append(el);
    }

    var DLT_SKETCH_W = 960;
    var DLT_SKETCH_H = 600;
    var SKETCH_COLORS = ["#111111", "#d93025", "#1a73e8", "#137333", "#f9ab00"];
    var SKETCH_WIDTHS = [2, 4, 8, 16];

    function pad2(n) { return String(n).padStart(2, "0"); }
    function sketchName(date) {
      return "sketch-" + String(date.getFullYear()) + pad2(date.getMonth() + 1) + pad2(date.getDate()) + "-" +
        pad2(date.getHours()) + pad2(date.getMinutes()) + pad2(date.getSeconds()) + ".png";
    }

    /** RPC 桥：typert gateway 的固定路径 + 本包命名空间。 */
    function makeCaller(getConnection) {
      return function call(method, args) {
        var connection = getConnection();
        if (connection === undefined || typeof connection.rpc !== "object" || typeof connection.rpc.call !== "function") {
          return Promise.reject(new Error("connection 服务不可用（" + PLUGIN_NAME + "）"));
        }
        return connection.rpc.call("/api", NS + "/" + method, { args: { args: args || {} } }).then(function (r) {
          if (r && r.ok) return r.value;
          var err = (r && r.error) || {};
          throw new Error(err.message || ("调用失败: " + method));
        });
      };
    }

    /**
     * 从「能收图的模型」里挑一个最合适的：同 provider 且名字带 vision 的优先，
     * 其次同 provider，再其次第一个。列表已由 Host **实时**按模型表过滤过。
     */
    function pickVisionRoute(list, curProvider) {
      var routes = Array.isArray(list) ? list : [];
      var p = String(curProvider || "");
      var same = [];
      for (var i = 0; i < routes.length; i++) {
        if (String(routes[i].provider || "") === p) same.push(routes[i]);
      }
      for (var a = 0; a < same.length; a++) {
        if (/vision/i.test(String(same[a].model))) return same[a];
      }
      if (same.length > 0) return same[0];
      return routes.length > 0 ? routes[0] : null;
    }

    /** 把会话模型切到某个视觉模型（走模型选择器同一条通道）。 */
    function switchModel(getDirs, sessionId, route) {
      var dirs = getDirs ? getDirs() : null;
      if (!dirs || typeof dirs.directoryFor !== "function") return Promise.resolve({ ok: false, error: "模型目录服务不可用（modelDirectories）" });
      var dir = null;
      try { dir = dirs.directoryFor(sessionId); } catch (e) { return Promise.resolve({ ok: false, error: "取不到本会话的模型目录：" + String(e && e.message ? e.message : e) }); }
      if (!dir || typeof dir.select !== "function") return Promise.resolve({ ok: false, error: "模型目录不支持选择（宿主版本过旧？）" });
      var prev = null;
      try { prev = dir.store && dir.store.getSnapshot ? dir.store.getSnapshot().current : null; } catch (e) { prev = null; }
      if (prev && prev.provider === route.provider && prev.model === route.model) return Promise.resolve({ ok: true, prev: prev, already: true });
      return Promise.resolve(dir.select({ provider: route.provider, model: route.model })).then(function (res) {
        if (res && res.ok === true) return { ok: true, prev: prev };
        var err = res && res.error ? (res.error.code ? res.error.code + ": " + res.error.message : String(res.error.message || res.error)) : "选择失败";
        return { ok: false, error: err, prev: prev };
      }).catch(function (e) {
        return { ok: false, error: String(e && e.message ? e.message : e), prev: prev };
      });
    }

    /**
     * 把画布产物交付到输入框：allowImage=true 且模型收图时挂图片附件，否则插路径。
     * 返回 `delivered` / `imageFailure`，调用方据此如实说话（不谎报「已作为图片注入」）。
     */
    function deliverSketch(getConversation, blob, name, saved, sessionId, allowImage) {
      var conv = getConversation();
      var shell = null;
      try {
        if (conv && conv.input && typeof conv.input.shell === "function" && sessionId) shell = conv.input.shell(sessionId);
      } catch (e) { shell = null; }

      var imageFailure = "";
      if (allowImage) {
        if (!conv || typeof conv.createDrafts !== "function" || !shell || typeof shell.addAttachments !== "function") {
          imageFailure = "客户端没有可用的附件通道（createDrafts / addAttachments 不可用）";
        } else {
          try {
            var file = new File([blob], name, { type: "image/png" });
            var drafts = conv.createDrafts(sessionId, [file]);
            var ids = drafts.map(function (d) { return d.id; });
            if (shell.addAttachments(ids)) {
              return { mode: "image", delivered: "image", path: saved.path, rel: saved.rel, name: name };
            }
            if (typeof conv.releaseDraftAttachments === "function") conv.releaseDraftAttachments(drafts);
            imageFailure = "宿主拒绝把这张图挂成附件（addAttachments 返回失败）";
          } catch (e) {
            imageFailure = String(e && e.message ? e.message : e);
          }
        }
      }

      var rel = saved.rel || saved.path;
      var line = "\n[草图] " + rel + "（当前模型不支持图片输入；切到视觉模型后可用 read_image 查看这张图）";
      var pasted = false;
      if (shell && typeof shell.paste === "function") { shell.paste(line); pasted = true; }
      else if (shell && typeof shell.setDraft === "function") {
        var cur = (shell.snapshot && shell.snapshot.draft) || "";
        shell.setDraft(cur + line);
        pasted = true;
      } else {
        try { navigator.clipboard.writeText(rel); pasted = true; } catch (e) { /* 剪贴板也不可用时只留提示 */ }
      }
      return {
        mode: "file", delivered: pasted ? "path" : "none",
        path: saved.path, rel: saved.rel, name: name,
        imageFailure: imageFailure,
        pathFailure: pasted ? "" : "输入框与剪贴板都不可用，路径只写进了这条提示",
      };
    }

    /** 画布弹窗。props: { call, getConversation, getDirs, getSessionId, sessionId, onClose, onDone }。 */
    function SketchPad(props) {
      var call = props.call;
      var canvasRef = React.useRef(null);
      var dragging = React.useRef(false);
      var lastPt = React.useRef(null);
      var history = React.useRef([]);
      var dirty = React.useRef(false);

      var colorPair = React.useState(SKETCH_COLORS[0]);
      var color = colorPair[0];
      var setColor = colorPair[1];
      var widthPair = React.useState(SKETCH_WIDTHS[1]);
      var width = widthPair[0];
      var setWidth = widthPair[1];
      var busyPair = React.useState(false);
      var busy = busyPair[0];
      var setBusy = busyPair[1];
      var msgPair = React.useState(null);
      var msg = msgPair[0];
      var setMsg = msgPair[1];
      var supportPair = React.useState(null);
      var support = supportPair[0];
      var setSupport = supportPair[1];
      var routePair = React.useState(null);
      var route = routePair[0];
      var setRoute = routePair[1];
      var revPair = React.useState(0);
      var setRev = revPair[1];

      React.useEffect(function () {
        var canvas = canvasRef.current;
        if (canvas) {
          canvas.width = DLT_SKETCH_W;
          canvas.height = DLT_SKETCH_H;
          var g = canvas.getContext("2d");
          if (g) {
            g.fillStyle = "#ffffff";
            g.fillRect(0, 0, DLT_SKETCH_W, DLT_SKETCH_H);
            g.lineCap = "round";
            g.lineJoin = "round";
          }
        }
        history.current = [];
        dirty.current = false;
        var alive = true;
        var sid = props.sessionId || (typeof props.getSessionId === "function" ? props.getSessionId() : "") || "";
        call("support", { sessionId: sid }).then(function (r) {
          if (!alive || !r || !r.ok) return;
          setSupport(r);
          if (r.images !== false) return;
          call("routes", { sessionId: sid }).then(function (v) {
            if (!alive || !v || !v.ok) return;
            var pick = pickVisionRoute(v.routes, r.provider || (v.current && v.current.provider));
            if (pick) setRoute(pick);
          }).catch(function () { /* 问不到就走「存 PNG + 路径」 */ });
        }).catch(function () { /* 问不到就按「纯文本模型」处理 */ });
        var onKey = function (event) { if (event.key === "Escape") props.onClose(); };
        try { window.addEventListener("keydown", onKey); } catch (e) { /* ignore */ }
        return function () {
          alive = false;
          try { window.removeEventListener("keydown", onKey); } catch (e) { /* ignore */ }
        };
      }, []);

      var pointOf = function (event) {
        var canvas = canvasRef.current;
        var rect = canvas.getBoundingClientRect();
        var scaleX = rect.width > 0 ? DLT_SKETCH_W / rect.width : 1;
        var scaleY = rect.height > 0 ? DLT_SKETCH_H / rect.height : 1;
        return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
      };
      // 历史栈存「**动笔之前**」的快照 + 当时的 dirty。落笔前抓，撤销才有东西可退。
      var pushHistory = function () {
        var canvas = canvasRef.current;
        if (!canvas) return;
        try {
          history.current.push({ url: canvas.toDataURL("image/png"), dirty: dirty.current === true });
          if (history.current.length > 12) history.current.shift();
        } catch (e) { /* ignore */ }
      };
      var onDown = function (event) {
        if (busy) return;
        var canvas = canvasRef.current;
        if (!canvas) return;
        event.preventDefault();
        pushHistory();
        try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
        dragging.current = true;
        lastPt.current = pointOf(event);
        var g = canvas.getContext("2d");
        if (g) {
          g.fillStyle = color;
          g.beginPath();
          g.arc(lastPt.current.x, lastPt.current.y, Math.max(1, width / 2), 0, Math.PI * 2);
          g.fill();
        }
        dirty.current = true;
        setRev(function (n) { return n + 1; });
      };
      var onMove = function (event) {
        if (!dragging.current || busy) return;
        var canvas = canvasRef.current;
        if (!canvas) return;
        event.preventDefault();
        var p = pointOf(event);
        var from = lastPt.current || p;
        var g = canvas.getContext("2d");
        if (g) {
          g.strokeStyle = color;
          g.lineWidth = width;
          g.beginPath();
          g.moveTo(from.x, from.y);
          g.lineTo(p.x, p.y);
          g.stroke();
        }
        lastPt.current = p;
      };
      var onUp = function (event) {
        if (!dragging.current) return;
        dragging.current = false;
        lastPt.current = null;
        try { canvasRef.current.releasePointerCapture(event.pointerId); } catch (e) { /* ignore */ }
        setRev(function (n) { return n + 1; });
      };
      var undo = function () {
        var canvas = canvasRef.current;
        if (!canvas || history.current.length === 0) return;
        var entry = history.current.pop();
        var url = entry && entry.url;
        if (!url) return;
        var img = new Image();
        img.onload = function () {
          var g = canvas.getContext("2d");
          if (g) {
            g.clearRect(0, 0, DLT_SKETCH_W, DLT_SKETCH_H);
            g.drawImage(img, 0, 0);
          }
          dirty.current = entry.dirty === true;
          setRev(function (n) { return n + 1; });
        };
        img.src = url;
        setRev(function (n) { return n + 1; });
      };
      var clearAll = function () {
        var canvas = canvasRef.current;
        if (!canvas) return;
        pushHistory();
        var g = canvas.getContext("2d");
        if (g) {
          g.fillStyle = "#ffffff";
          g.fillRect(0, 0, DLT_SKETCH_W, DLT_SKETCH_H);
        }
        dirty.current = false;
        setRev(function (n) { return n + 1; });
      };

      /**
       * 导入：**先实时问一遍模型表**（画布开着的时候用户可能已经换了模型），
       * 再决定交付方式。画布 → PNG → save 落盘 → 交付（图片附件 / 路径）。
       */
      var doImport = function () {
        var canvas = canvasRef.current;
        if (!canvas || busy) return;
        if (!dirty.current) { setMsg({ text: "画布还是空的：先画两笔再导入" }); return; }
        setBusy(true);
        setMsg(null);
        var sessionId = props.sessionId || (typeof props.getSessionId === "function" ? props.getSessionId() : "") || "";
        var name = sketchName(new Date());
        var toBlob = new Promise(function (resolve) {
          try { canvas.toBlob(function (blob) { resolve(blob); }, "image/png"); } catch (e) { resolve(null); }
        });
        // ★ 不做任何缓存复用：每次都重新问 Host「此刻这个会话到底用哪个模型、收不收图」。
        Promise.all([
          call("support", { sessionId: sessionId }).catch(function () { return null; }),
          toBlob,
        ]).then(function (pair) {
          var sup = pair[0];
          var blob = pair[1];
          if (!blob) throw new Error("画布导出 PNG 失败（浏览器不支持 toBlob？）");
          if (!sup || sup.ok === false) return { sup: null, blob: blob, route: null };
          setSupport(sup);
          if (sup.images) return { sup: sup, blob: blob, route: null };
          return call("routes", { sessionId: sessionId }).then(function (v) {
            var pick = (v && v.ok) ? pickVisionRoute(v.routes, sup.provider || (v.current && v.current.provider)) : null;
            setRoute(pick);
            return { sup: sup, blob: blob, route: pick };
          }).catch(function () { setRoute(null); return { sup: sup, blob: blob, route: null }; });
        }).then(function (r) {
          if (!r.sup) throw new Error("无法确认当前模型是否支持图片（support 端点不可用）；草图的落盘与交付方式无法判定");
          return new Promise(function (resolve, reject) {
            var reader = new FileReader();
            reader.onload = function () { resolve(String(reader.result || "")); };
            reader.onerror = function () { reject(new Error("读取画布数据失败")); };
            reader.readAsDataURL(r.blob);
          }).then(function (dataUrl) {
            return call("save", { sessionId: sessionId, dataUrl: dataUrl, name: name }).then(function (saved) {
              if (!saved || saved.ok === false) throw new Error((saved && saved.error) || "草图保存失败");
              return { blob: r.blob, saved: saved, sup: r.sup, route: r.route, sessionId: sessionId, name: name };
            });
          });
        }).then(function (r) {
          // 交付：当前模型收图 → 直接附件；不收图但有视觉模型 → 先切再附件；都没有 → 存 PNG + 路径。
          var canImage = !!(r.sup && r.sup.images);
          if (canImage || !r.route) return { r: r, mode: canImage ? "image" : "file", switched: null };
          return switchModel(props.getDirs, r.sessionId, r.route).then(function (res) {
            if (!res.ok) throw new Error("切到视觉模型 " + r.route.model + " 失败：" + (res.error || "未知原因"));
            return { r: r, mode: "image", switched: res.already ? null : { to: r.route, prev: res.prev } };
          });
        }).then(function (plan) {
          var r = plan.r;
          var out = deliverSketch(props.getConversation, r.blob, r.name, r.saved, r.sessionId, plan.mode === "image");
          out.switched = plan.switched;
          out.support = r.sup || null;
          if (plan.mode === "image" && out.mode !== "image") {
            out.support = Object.assign({}, r.sup || {}, { images: false, reason: out.imageFailure || "附件通道不可用" });
          }
          setBusy(false);
          props.onDone(out);
        }).catch(function (error) {
          setBusy(false);
          setMsg({ text: "✗ " + String(error && error.message ? error.message : error) });
        });
      };

      var hintText = support
        ? (support.images
          ? "当前模型支持图片：导入后作为图片附件"
          : (route
            ? "当前模型不支持图片 → 导入时切到 " + route.model + "，再作为图片附件"
            : (support.reason || "没有可用的视觉模型：将存成 PNG 并把路径插进输入框")))
        : "正在确认当前模型是否支持图片…";
      var primaryLabel = !support
        ? "导入"
        : (support.images ? "导入为图片" : (route ? "切到视觉模型并导入" : "存 PNG 并插入路径"));
      var primaryHint = !support
        ? "正在确认当前模型是否支持图片…"
        : (support.images
          ? "作为图片附件放进输入框：模型直接看图，不需要任何工具调用"
          : (route
            ? "先切到 " + route.model + "，再把草图作为图片附件放进输入框（导入后可一键切回）"
            : "没有可用的视觉模型：存成 PNG 并把路径插进输入框"));

      return React.createElement("div", {
        className: "dsd-mask",
        onMouseDown: function (event) { if (event.target === event.currentTarget && !busy) props.onClose(); },
      },
        React.createElement("div", { className: "dsd-panel" },
          React.createElement("div", { className: "dsd-head" },
            React.createElement("span", null, "草图 · 现画一张"),
            React.createElement("span", { className: "dsd-hint" }, hintText)),
          React.createElement("div", { className: "dsd-tools" },
            SKETCH_COLORS.map(function (c) {
              return React.createElement("button", {
                key: c, type: "button",
                className: "dsd-sw" + (c === color ? " dsd-mini-on" : ""),
                style: { background: c },
                title: "颜色 " + c,
                "aria-label": "画笔颜色 " + c,
                onClick: function () { setColor(c); },
              });
            }),
            React.createElement("span", { className: "dsd-note" }, "·"),
            SKETCH_WIDTHS.map(function (w) {
              return React.createElement("button", {
                key: "w" + w, type: "button",
                className: "dsd-mini" + (w === width ? " dsd-mini-on" : ""),
                title: "线宽 " + w + "px",
                onClick: function () { setWidth(w); },
              }, w + "px");
            }),
            React.createElement("span", { style: { flex: 1 } }),
            React.createElement("button", {
              type: "button", className: "dsd-mini",
              disabled: history.current.length === 0 || busy,
              onClick: undo,
            }, "撤销"),
            React.createElement("button", { type: "button", className: "dsd-mini", disabled: busy, onClick: clearAll }, "清空")),
          React.createElement("div", { className: "dsd-stage" },
            React.createElement("canvas", {
              ref: canvasRef,
              className: "dsd-canvas",
              width: DLT_SKETCH_W,
              height: DLT_SKETCH_H,
              onPointerDown: onDown,
              onPointerMove: onMove,
              onPointerUp: onUp,
              onPointerCancel: onUp,
              onPointerLeave: onUp,
            })),
          React.createElement("div", { className: "dsd-foot" },
            msg ? React.createElement("span", { className: "dsd-err" }, msg.text) : null,
            React.createElement("span", { style: { flex: 1 } }),
            React.createElement("button", { type: "button", className: "dsd-mini", disabled: busy, onClick: props.onClose }, "取消"),
            React.createElement("button", {
              type: "button", className: "dsd-mini dsd-on", disabled: busy, onClick: doImport,
              title: primaryHint,
            }, busy ? "导入中…" : primaryLabel))));
    }

    /** 输入框「+」旁的草图按钮。 */
    function createSketchButton(deps) {
      return function SketchButton(props) {
        // 会话 id **优先取槽位给的 props.sessionId**：DET 的状态框就栽在这上面 ——
        // `sessions.list.getSnapshot()` 在这个宿主版本里只有 `byId`，「当前会话」由
        // ui-session 自己持有，于是猜出来的 id 经常是空的，凡是依赖它的都静默失效。
        // 槽位给的才是最可靠的那一份；猜只当兜底。
        var sid = function () {
          try {
            if (props && props.sessionId) return String(props.sessionId);
          } catch (e) { /* ignore */ }
          return deps.getSessionId() || "";
        };
        var openPair = React.useState(false);
        var open = openPair[0];
        var setOpen = openPair[1];
        var notePair = React.useState(null);
        var note = notePair[0];
        var setNote = notePair[1];
        var switchedPair = React.useState(null);
        var switched = switchedPair[0];
        var setSwitched = switchedPair[1];

        var close = function () { setOpen(false); };
        var done = function (out) {
          setOpen(false);
          if (!out) return;
          var text;
          if (out.mode === "image") {
            text = out.switched
              ? "✓ 已切到 " + out.switched.to.model + " 并把草图作为图片附件放进输入框（原图 " + (out.rel || out.path) + "）"
              : "✓ 草图已作为图片附件放进输入框（原图：" + (out.rel || out.path) + "）";
          } else if (out.imageFailure) {
            text = "⚠ 已存成 PNG：" + (out.rel || out.path) + "（作为图片附件失败：" + out.imageFailure + "）";
          } else if (out.delivered === "none") {
            text = "⚠ 草图画好了：" + (out.rel || out.path) + "（输入框不可用，路径没能插进去）";
          } else {
            text = "✓ 草图画好了：" + (out.rel || out.path) + "（没有可用的视觉模型，路径已插进输入框）";
          }
          setNote({ ok: !(out.imageFailure || out.delivered === "none"), text: text });
          setSwitched(out.switched || null);
        };
        var switchBack = function () {
          var info = switched;
          if (!info || !info.prev || !info.prev.provider || !info.prev.model) return;
          setNote({ ok: true, text: "正在切回 " + info.prev.model + " …" });
          switchModel(deps.getDirs, sid(), { provider: info.prev.provider, model: info.prev.model }).then(function (res) {
            if (res.ok) { setSwitched(null); setNote({ ok: true, text: "✓ 已切回 " + info.prev.model }); }
            else setNote({ ok: false, text: "✗ 切回失败：" + (res.error || "未知原因") });
          });
        };
        var body = typeof document !== "undefined" ? document.body : null;
        var mask = open
          ? React.createElement(SketchPad, {
            call: deps.call,
            getConversation: deps.getConversation,
            getDirs: deps.getDirs,
            getSessionId: deps.getSessionId,
            sessionId: sid(),
            onClose: close,
            onDone: done,
          })
          : null;
        var pad = mask && ReactDOM && body ? ReactDOM.createPortal(mask, body) : mask;
        return React.createElement("span", { style: { display: "inline-flex", alignItems: "center", gap: "6px" } },
          React.createElement("button", {
            type: "button",
            className: "dsd-btn",
            title: "画一张草图并作为图片注入输入框（当前模型不收图时会先切到视觉模型）",
            "aria-label": "画草图并导入",
            onMouseDown: function (event) { event.preventDefault(); },
            onClick: function () { setNote(null); setSwitched(null); setOpen(true); },
          },
            React.createElement("svg", {
              viewBox: "0 0 16 16", width: 15, height: 15, "aria-hidden": true,
              fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round", strokeLinejoin: "round",
            },
              React.createElement("path", { d: "M11.6 2.4l2 2-8.1 8.1-2.7.7.7-2.7 8.1-8.1z" }),
              React.createElement("path", { d: "M10.2 3.8l2 2" }))),
          note ? React.createElement("span", {
            className: note.ok ? "dsd-ok" : "dsd-err",
            title: note.text,
            style: { maxWidth: "260px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" },
          }, note.text) : null,
          switched && switched.prev && switched.prev.model
            ? React.createElement("button", {
              type: "button", className: "dsd-mini",
              title: "把本会话模型切回 " + switched.prev.model,
              onMouseDown: function (event) { event.preventDefault(); },
              onClick: switchBack,
            }, "切回 " + switched.prev.model)
            : null,
          pad);
      };
    }

    function apply(ctx) {
      ensureStyles();
      var call = makeCaller(function () {
        try { return ctx.get(CLIENT_SERVICE.connection); } catch (e) { return undefined; }
      });
      var getConversation = function () {
        try { return ctx.get(CLIENT_SERVICE.conversation) || null; } catch (e) { return null; }
      };
      var getDirs = function () {
        try { return ctx.get(CLIENT_SERVICE.modelDirectories) || null; } catch (e) { return null; }
      };
      var getSessionId = function () {
        try {
          var list = ctx.sessions.list.getSnapshot();
          var byId = (list && list.byId) || {};
          var keys = Object.keys(byId);
          for (var i = 0; i < keys.length; i++) {
            var row = byId[keys[i]];
            if (row && row.retainedBy && (row.retainedBy.mainView || 0) > 0) return keys[i];
          }
          if (keys.length === 1) return keys[0];
        } catch (e) { /* ignore */ }
        return undefined;
      };

      var SketchButton = createSketchButton({ call: call, getSessionId: getSessionId, getConversation: getConversation, getDirs: getDirs });

      var mounted = false;
      var mountButton = function (why) {
        if (mounted) return;
        mounted = true;
        try {
          ctx.slots.inject("conversation.input.left", function () {
            return ctx.slots.register({ name: "conversation.input.left", id: "dsd-sketch", order: 41 }, SketchButton);
          });
        } catch (e) {
          mounted = false; // 槽还不存在：留给下一次重试
          throw e;
        }
        if (why) { try { console.info("[" + PLUGIN_NAME + "] " + why); } catch (e) { /* ignore */ } }
      };

      /**
       * 单拥有者：先问宿主「本包是不是在让位」，让位就**一个 slot 都不注册**
       * （于是输入框旁永远只有一个铅笔）。
       *
       * 客户端 bundle 有可能比宿主半区先就绪，所以这里**重试**几次再下结论；
       * 真的一直问不到（宿主半区没装载）才按「本包全责」挂上，并如实说明风险 ——
       * 对一个「装了却什么都没出现」的插件来说，静默失效比多一个按钮更糟。
       */
      var attempt = 0;
      var MAX_ATTEMPTS = 8;
      var checkOwner = function () {
        attempt++;
        call("status", {}).then(function (st) {
          if (st && st.suppressed === true) {
            try {
              console.info("[" + PLUGIN_NAME + "] 让位中，未挂载草图按钮：" + (st.suppressedBy || "") + " " + ((st.det && st.det.reason) || ""));
            } catch (e) { /* ignore */ }
            return; // 明确让位 → 到此为止，不挂
          }
          mountButton("");
        }).catch(function (err) {
          if (attempt < MAX_ATTEMPTS && !mounted) {
            if (typeof setTimeout === "function") setTimeout(checkOwner, 500);
            return;
          }
          try {
            mountButton("宿主半区一直没应答（" + String(err && err.message ? err.message : err) + "）：按本包全责挂上按钮；若同时装了 DET，请把 DET 的「草图导入」关掉以免出现两个按钮");
          } catch (e) { /* 槽不存在：不挂载 */ }
        });
      };
      checkOwner();
    }

    exports.apply = apply;
    exports.name = PLUGIN_NAME;
    exports.inject = CLIENT_INJECT;
    return module.exports;
  },
});
