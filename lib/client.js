// dsh-sketch-draft — Client 半区（预打包浏览器 bundle）。
//
// 输入框「+」旁边一个铅笔按钮：点开画布 → 随手画 → 作为**图片附件**放进输入框。
//
// 和上游 1.0.0 的关键区别：**不调任何宿主端点**。
// 上游走 `connection.rpc.call("/api", "dshSketchDraft/support", …)`，而 dsh 0.2.1
// 的 endpoint 校验是 /^[A-Za-z0-9_$.-]+$/ —— 不含斜杠，调用直接被传输层拒绝，
// 于是画布底部永远显示「support 端点不可用」，导入按钮点了也没反应。
//
// 现在图片交付走客户端本来就有的通道：
//   conversation.createDrafts(sessionId, [file]) → draft.id[]
//   conversation.input.shell(sessionId).addAttachments(ids) → boolean
// 所以不需要 typert、不需要 HTTP 路由，宿主换传输层也不会再整条链失效。
//
// 这个文件是预打包产物（host 的 dsh-client-modules 用 lazy CJS 装载它）：
// 只能 require 图里的外部依赖，不能有相对导入 —— 所以这里自包含。
// 类名一律 dsd- 前缀，样式带 data-plugin-css 归属，不碰别人的 DOM/CSS。

window.__ModuleLoader__.load({
  id: "dsh-sketch-draft",
  factory: function (require) {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });

    var React = require("react");
    var ReactDOM = require("react-dom");

    var PLUGIN_NAME = "dsh-sketch-draft";
    var INJECT = ["slots", "sessions"];

    // 画布逻辑尺寸（导出 PNG 的像素尺寸）。显示时按容器等比缩放。
    var W = 1000;
    var H = 620;
    var COLORS = ["#1f2328", "#e5484d", "#3b82f6", "#22a06b", "#f5a524"];
    var WIDTHS = [2, 4, 8, 16];

    var CSS = [
      ".dsd-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;",
      "border:1px solid transparent;border-radius:999px;background:transparent;color:var(--dsw-alias-label-secondary,#5b616e);",
      "cursor:pointer;flex:none}",
      ".dsd-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06));color:var(--dsw-alias-label-primary,#1f2328)}",
      ".dsd-btn:focus-visible{outline:2px solid var(--dsw-alias-accent-primary,#3b82f6);outline-offset:2px}",

      ".dsd-mask{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;",
      "padding:24px;background:rgba(15,17,22,.42);backdrop-filter:blur(2px)}",
      ".dsd-panel{width:min(1040px,100%);max-height:100%;display:flex;flex-direction:column;overflow:hidden;",
      "border-radius:14px;background:var(--dsw-alias-bg-primary,#fff);color:var(--dsw-alias-label-primary,#1f2328);",
      "box-shadow:0 24px 64px rgba(0,0,0,.28);border:1px solid rgba(0,0,0,.08)}",
      ".dsd-head{display:flex;align-items:center;gap:10px;padding:12px 14px;border-bottom:1px solid rgba(0,0,0,.07);flex-wrap:wrap}",
      ".dsd-title{font-size:14px;font-weight:600;margin-right:4px}",
      ".dsd-swat{width:20px;height:20px;border-radius:999px;border:2px solid transparent;cursor:pointer;padding:0;flex:none}",
      ".dsd-swat[data-on='1']{border-color:var(--dsw-alias-label-primary,#1f2328);box-shadow:0 0 0 2px var(--dsw-alias-bg-primary,#fff) inset}",
      ".dsd-wid{min-width:40px;height:24px;padding:0 8px;border-radius:6px;border:1px solid rgba(0,0,0,.14);",
      "background:transparent;color:inherit;font-size:12px;cursor:pointer;flex:none}",
      ".dsd-wid[data-on='1']{background:var(--dsw-alias-interactive-bg-active,rgba(0,0,0,.08));border-color:transparent}",
      ".dsd-grow{flex:1 1 auto}",
      ".dsd-mini{height:26px;padding:0 10px;border-radius:7px;border:1px solid rgba(0,0,0,.14);background:transparent;",
      "color:inherit;font-size:12px;cursor:pointer;flex:none}",
      ".dsd-mini:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(0,0,0,.06))}",
      ".dsd-mini[disabled]{opacity:.4;cursor:default}",
      ".dsd-body{padding:14px;overflow:auto;background:var(--dsw-alias-bg-secondary,#f6f7f9)}",
      ".dsd-canvas{display:block;width:100%;height:auto;border-radius:10px;background:#fff;cursor:crosshair;",
      "touch-action:none;box-shadow:0 1px 3px rgba(0,0,0,.12)}",
      ".dsd-foot{display:flex;align-items:center;gap:10px;padding:10px 14px;border-top:1px solid rgba(0,0,0,.07)}",
      ".dsd-note{font-size:12px;line-height:1.4;flex:1 1 auto;min-width:0}",
      ".dsd-note[data-ok='1']{color:var(--dsw-alias-status-success,#22a06b)}",
      ".dsd-note[data-ok='0']{color:var(--dsw-alias-status-danger,#e5484d)}",
      ".dsd-primary{height:30px;padding:0 14px;border-radius:8px;border:none;cursor:pointer;font-size:13px;font-weight:600;",
      "background:var(--dsw-alias-accent-primary,#111827);color:var(--dsw-alias-label-on-accent,#fff)}",
      ".dsd-primary[disabled]{opacity:.5;cursor:default}",
    ].join("");

    function ensureStyles() {
      if (typeof document === "undefined") return;
      if (document.querySelector('style[data-plugin-css="' + PLUGIN_NAME + '"]')) return;
      var el = document.createElement("style");
      el.setAttribute("data-plugin-css", PLUGIN_NAME);
      el.textContent = CSS;
      (document.head || document.documentElement).appendChild(el);
    }

    function stamp() {
      var d = new Date();
      function p2(n) { return (n < 10 ? "0" : "") + n; }
      return d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate()) + "-" +
        p2(d.getHours()) + p2(d.getMinutes()) + p2(d.getSeconds());
    }

    function downloadBlob(blob, name) {
      try {
        var url = URL.createObjectURL(blob);
        var a = document.createElement("a");
        a.href = url;
        a.download = name;
        a.style.display = "none";
        document.body.appendChild(a);
        a.click();
        setTimeout(function () {
          try { URL.revokeObjectURL(url); } catch (e) { /* ignore */ }
          try { a.remove(); } catch (e) { /* ignore */ }
        }, 1500);
        return true;
      } catch (e) {
        return false;
      }
    }

    /** 画布：固定逻辑尺寸，指针坐标按 rect 等比换算。 */
    function Pad(props) {
      var canvasRef = React.useRef(null);
      var strokes = React.useRef([]);
      var current = React.useRef(null);

      var colorState = React.useState(COLORS[0]);
      var color = colorState[0], setColor = colorState[1];
      var widthState = React.useState(WIDTHS[1]);
      var width = widthState[0], setWidth = widthState[1];
      var revState = React.useState(0);
      var rev = revState[0], bump = revState[1];
      var busyState = React.useState(false);
      var busy = busyState[0], setBusy = busyState[1];
      var msgState = React.useState(null);
      var msg = msgState[0], setMsg = msgState[1];

      var paint = function () {
        var canvas = canvasRef.current;
        if (!canvas) return;
        var g = canvas.getContext("2d");
        g.setTransform(1, 0, 0, 1, 0, 0);
        g.fillStyle = "#ffffff";
        g.fillRect(0, 0, W, H);
        g.lineCap = "round";
        g.lineJoin = "round";
        for (var i = 0; i < strokes.current.length; i++) {
          var s = strokes.current[i];
          if (!s.pts.length) continue;
          if (s.pts.length === 1) {
            g.beginPath();
            g.arc(s.pts[0].x, s.pts[0].y, Math.max(0.7, s.width / 2), 0, Math.PI * 2);
            g.fillStyle = s.color;
            g.fill();
            continue;
          }
          g.strokeStyle = s.color;
          g.lineWidth = s.width;
          g.beginPath();
          g.moveTo(s.pts[0].x, s.pts[0].y);
          for (var j = 1; j < s.pts.length; j++) g.lineTo(s.pts[j].x, s.pts[j].y);
          g.stroke();
        }
      };

      React.useEffect(function () {
        var canvas = canvasRef.current;
        if (canvas) {
          canvas.width = W;
          canvas.height = H;
          paint();
        }
        var onKey = function (event) {
          if (event.key === "Escape") {
            event.stopPropagation();
            props.onClose();
          }
        };
        window.addEventListener("keydown", onKey, true);
        return function () {
          window.removeEventListener("keydown", onKey, true);
        };
      }, []);

      var pointOf = function (event) {
        var canvas = canvasRef.current;
        var rect = canvas.getBoundingClientRect();
        var sx = rect.width ? W / rect.width : 1;
        var sy = rect.height ? H / rect.height : 1;
        return { x: (event.clientX - rect.left) * sx, y: (event.clientY - rect.top) * sy };
      };

      var onDown = function (event) {
        if (busy) return;
        event.preventDefault();
        var canvas = canvasRef.current;
        if (!canvas) return;
        try { canvas.setPointerCapture(event.pointerId); } catch (e) { /* ignore */ }
        var stroke = { color: color, width: width, pts: [pointOf(event)] };
        strokes.current.push(stroke);
        current.current = stroke;
        paint();
        bump(function (v) { return v + 1; });
      };

      var onMove = function (event) {
        var stroke = current.current;
        if (!stroke) return;
        event.preventDefault();
        var p = pointOf(event);
        var prev = stroke.pts[stroke.pts.length - 1];
        stroke.pts.push(p);
        var canvas = canvasRef.current;
        var g = canvas && canvas.getContext("2d");
        if (!g) return;
        g.strokeStyle = stroke.color;
        g.lineWidth = stroke.width;
        g.beginPath();
        g.moveTo(prev.x, prev.y);
        g.lineTo(p.x, p.y);
        g.stroke();
      };

      var onUp = function () {
        if (!current.current) return;
        current.current = null;
        bump(function (v) { return v + 1; });
      };

      var undo = function () {
        if (!strokes.current.length) return;
        strokes.current.pop();
        paint();
        bump(function (v) { return v + 1; });
      };

      var clearAll = function () {
        strokes.current = [];
        paint();
        bump(function (v) { return v + 1; });
      };

      var toBlob = function () {
        return new Promise(function (resolve, reject) {
          var canvas = canvasRef.current;
          if (!canvas) { reject(new Error("画布不可用")); return; }
          if (typeof canvas.toBlob !== "function") { reject(new Error("这个浏览器没有 canvas.toBlob")); return; }
          try {
            canvas.toBlob(function (blob) {
              if (blob) resolve(blob);
              else reject(new Error("导出 PNG 失败"));
            }, "image/png");
          } catch (e) {
            reject(e instanceof Error ? e : new Error(String(e)));
          }
        });
      };

      var doImport = function () {
        if (busy) return;
        setBusy(true);
        setMsg(null);
        var name = "doodle-" + stamp() + ".png";
        toBlob().then(function (blob) {
          return props.deliver(blob, name).then(function () {
            setMsg({ ok: true, text: "已作为图片附件放进输入框" });
            setTimeout(function () { props.onClose(); }, 260);
          }).catch(function (err) {
            var saved = downloadBlob(blob, name);
            setMsg({
              ok: false,
              text: (err && err.message ? err.message : String(err)) +
                (saved ? "；已改为下载 PNG（可再手动拖进输入框）" : "；下载也没成功"),
            });
          });
        }).catch(function (err) {
          setMsg({ ok: false, text: err && err.message ? err.message : String(err) });
        }).then(function () {
          setBusy(false);
        });
      };

      var head = React.createElement("div", { className: "dsd-head" },
        React.createElement("span", { className: "dsd-title" }, "画一张"),
        COLORS.map(function (c) {
          return React.createElement("button", {
            key: c, type: "button", className: "dsd-swat", title: c,
            "data-on": c === color ? "1" : "0",
            style: { background: c },
            onMouseDown: function (e) { e.preventDefault(); },
            onClick: function () { setColor(c); },
          });
        }),
        React.createElement("span", { className: "dsd-grow" }),
        WIDTHS.map(function (w) {
          return React.createElement("button", {
            key: w, type: "button", className: "dsd-wid",
            "data-on": w === width ? "1" : "0",
            onMouseDown: function (e) { e.preventDefault(); },
            onClick: function () { setWidth(w); },
          }, w + "px");
        }),
        React.createElement("span", { className: "dsd-grow" }),
        React.createElement("button", {
          type: "button", className: "dsd-mini",
          disabled: !strokes.current.length,
          onMouseDown: function (e) { e.preventDefault(); },
          onClick: undo,
        }, "撤销"),
        React.createElement("button", {
          type: "button", className: "dsd-mini",
          disabled: !strokes.current.length,
          onMouseDown: function (e) { e.preventDefault(); },
          onClick: clearAll,
        }, "清空"));

      var body = React.createElement("div", { className: "dsd-body" },
        React.createElement("canvas", {
          ref: canvasRef,
          className: "dsd-canvas",
          width: W,
          height: H,
          onPointerDown: onDown,
          onPointerMove: onMove,
          onPointerUp: onUp,
          onPointerCancel: onUp,
          onPointerLeave: onUp,
        }));

      var note = msg
        ? React.createElement("span", {
          className: "dsd-note",
          "data-ok": msg.ok ? "1" : "0",
          title: msg.text,
        }, msg.text)
        : React.createElement("span", { className: "dsd-note", style: { opacity: .7 } },
          "画完点「导入」→ 图片作为附件进输入框；Esc 关闭");

      var foot = React.createElement("div", { className: "dsd-foot" },
        note,
        React.createElement("button", {
          type: "button", className: "dsd-mini",
          onMouseDown: function (e) { e.preventDefault(); },
          onClick: props.onClose,
        }, "取消"),
        React.createElement("button", {
          type: "button", className: "dsd-primary",
          disabled: busy,
          onMouseDown: function (e) { e.preventDefault(); },
          onClick: doImport,
        }, busy ? "导入中…" : "导入"));

      return React.createElement("div", {
        className: "dsd-mask",
        onMouseDown: function (event) { if (event.target === event.currentTarget) props.onClose(); },
      }, React.createElement("div", { className: "dsd-panel", role: "dialog", "aria-label": "画一张草图" }, head, body, foot));
    }

    /** 把 PNG 挂进输入框的附件区。失败抛错，由调用方决定怎么兜底。 */
    function deliver(ctx, blob, name, sessionId) {
      var conv = null;
      try { conv = ctx.get("conversation") || null; } catch (e) { conv = null; }
      if (!conv) return Promise.reject(new Error("conversation 服务不可用"));
      if (typeof conv.createDrafts !== "function") {
        return Promise.reject(new Error("这一版没有 conversation.createDrafts，挂不了附件"));
      }
      var shell = null;
      try {
        if (conv.input && typeof conv.input.shell === "function" && sessionId) shell = conv.input.shell(sessionId);
      } catch (e) { shell = null; }
      if (!shell || typeof shell.addAttachments !== "function") {
        return Promise.reject(new Error("输入框没有可用的附件通道（shell.addAttachments）"));
      }
      var file;
      try {
        file = new File([blob], name, { type: "image/png" });
      } catch (e) {
        return Promise.reject(new Error("构造 File 失败：" + String(e && e.message ? e.message : e)));
      }
      var drafts = [];
      try {
        drafts = conv.createDrafts(sessionId, [file]) || [];
      } catch (e) {
        return Promise.reject(new Error("createDrafts 失败：" + String(e && e.message ? e.message : e)));
      }
      var ids = drafts.map(function (d) { return d && d.id; }).filter(Boolean);
      if (!ids.length) return Promise.reject(new Error("createDrafts 没有返回 draft id"));
      var ok = false;
      try { ok = shell.addAttachments(ids); } catch (e) { ok = false; }
      if (!ok) {
        try { if (typeof conv.releaseDraftAttachments === "function") conv.releaseDraftAttachments(drafts); } catch (e) { /* ignore */ }
        return Promise.reject(new Error("宿主拒绝把这张图挂成附件"));
      }
      return Promise.resolve();
    }

    function apply(ctx) {
      ensureStyles();

      // 菜单文案跟随界面语言（拿不到 navigator 就当中文）
      var english = false;
      try {
        english = /^en/i.test(String((typeof navigator !== "undefined" && navigator.language) || ""));
      } catch (e) { english = false; }
      var LABEL = english ? "Sketch" : "画一张";
      var HINT = english
        ? "Sketch something and attach it to the conversation"
        : "画一张，直接作为图片附件放进输入框";

      // 图标来自宿主自带的 primitives；拿不到就不给图标，菜单行照样能点
      var icon = null;
      try {
        var primitives = require("@deepseek-ai/dsh-client-ui-primitives");
        icon = primitives.IconEditOutlineRegular || primitives.IconPaperclipOutlineRegular || null;
      } catch (e) { icon = null; }

      // 一行「打开画布」的意图，三个入口共用：命令菜单、回退按钮、已打开的画布
      var runtime = { menu: false, openers: [], listeners: [], sessionId: undefined };
      var notify = function () {
        for (var i = 0; i < runtime.listeners.length; i++) {
          try { runtime.listeners[i](); } catch (e) { /* ignore */ }
        }
      };
      var requestOpen = function (sessionId) {
        if (sessionId) runtime.sessionId = sessionId;
        for (var i = 0; i < runtime.openers.length; i++) {
          try { runtime.openers[i](true); } catch (e) { /* ignore */ }
        }
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

      // 主入口：输入框「+」那个菜单里的一个 action（和「文件」并排），
      // 与 ui-conversation 注册 File 用的是同一个 commandUi 注册点。
      ctx.inject(["commandUi"], function (scope) {
        try {
          var commands = scope.get("commandUi");
          if (!commands || typeof commands.register !== "function") return;
          scope.effect(function () {
            return commands.register({
              name: "sketch",
              label: function () { return LABEL; },
              icon: icon || undefined,
              available: function () { return true; },
              ui: {
                kind: "action",
                run: function (session) {
                  requestOpen(session && session.sessionId);
                },
              },
            });
          }, "dsh-sketch-draft: sketch action");
          runtime.menu = true;
          notify();
        } catch (e) {
          try { console.warn("[dsh-sketch-draft] 注册「画一张」菜单项失败，改用输入框旁的按钮：", e); } catch (err) { /* ignore */ }
        }
      });

      // 画布挂载点。菜单可用时它只负责 createPortal，不占任何视觉空间；
      // 菜单不可用（旧版宿主）时退回成输入框左边的铅笔按钮。
      var PadHost = function () {
        var openState = React.useState(false);
        var open = openState[0], setOpen = openState[1];
        var revState = React.useState(0);
        var setRev = revState[1];

        React.useEffect(function () {
          runtime.openers.push(setOpen);
          var onMenuChange = function () { setRev(function (v) { return v + 1; }); };
          runtime.listeners.push(onMenuChange);
          return function () {
            runtime.openers = runtime.openers.filter(function (f) { return f !== setOpen; });
            runtime.listeners = runtime.listeners.filter(function (f) { return f !== onMenuChange; });
          };
        }, []);

        var button = null;
        if (!runtime.menu) {
          button = React.createElement("button", {
            type: "button",
            className: "dsd-btn",
            title: HINT,
            "aria-label": HINT,
            onMouseDown: function (event) { event.preventDefault(); },
            onClick: function () { setOpen(true); },
          }, React.createElement("svg", {
            viewBox: "0 0 16 16", width: 15, height: 15, "aria-hidden": true,
            fill: "none", stroke: "currentColor", strokeWidth: 1.6,
            strokeLinecap: "round", strokeLinejoin: "round",
          },
            React.createElement("path", { d: "M11.6 2.4l2 2-8.1 8.1-2.7.7.7-2.7 8.1-8.1z" }),
            React.createElement("path", { d: "M10.2 3.8l2 2" })));
        }

        if (!open || typeof document === "undefined") return button;

        var pad = React.createElement(Pad, {
          onClose: function () { setOpen(false); },
          deliver: function (blob, name) {
            return deliver(ctx, blob, name, runtime.sessionId || getSessionId());
          },
        });

        return React.createElement(React.Fragment, null, button,
          ReactDOM.createPortal(pad, document.body));
      };

      ctx.slots.inject("conversation.input.left", function () {
        return ctx.slots.register({
          name: "conversation.input.left",
          id: "dsh-sketch-draft",
          order: 42,
        }, PadHost);
      });
    }

    exports.apply = apply;
    exports.name = PLUGIN_NAME;
    exports.inject = INJECT;
    return module.exports;
  },
});
