# dsh-sketch-draft

> 输入框「+」旁边的一个小铅笔：**现画一张，直接作为图片附件放进对话。**

DeepSeek Harness（dsh）插件。这是 [LLYlab/DSHSketchDraft](https://github.com/LLYlab/DSHSketchDraft)
1.0.0 的 fork：**把图片交付从宿主 typert 端点改成纯客户端**，因为上游那套端点在
dsh 0.2.1 上已经整条链失效（见下）。

- 上游 1.0.0 由 LLYlab 编写，MIT，见 [LICENSE](./LICENSE)
- 本 fork 的改动见 [CHANGELOG.md](./CHANGELOG.md) 的 **1.1.0**
- 本仓库的第一个 commit 是上游原样代码，之后的 commit 才是我改的，方便逐行对照

---

## 上游在 dsh 0.2.1 上的问题

点「导入」时画布底部固定显示：

```
× 无法确认当前模型是否支持图片（support 端点不可用）：草图的落盘与交付方式无法判定
```

根因不在业务逻辑，在传输层。上游客户端这样调用宿主：

```js
connection.rpc.call("/api", "dshSketchDraft/support", { args: … })
```

而 dsh 0.2.1 的 RPC 在发出前会校验 endpoint：

```js
const ENDPOINT_SEGMENT_PATTERN = /^[A-Za-z0-9_$.-]+$/   // 不含 "/"
```

`dshSketchDraft/support` 命中斜杠，直接被 `assertTarget` 抛错，`support` 永远拿不到。
宿主办区那侧还注册在 typert 0.1.7 的协议上，改客户端一处也对不上，所以这个 fork
没有去修补传输，而是**换掉整条交付路径**。

---

## 与上游 1.0.0 的差异

| | 上游 1.0.0 | 本 fork 1.1.0 |
|---|---|---|
| 图片交付 | 宿主 `save` + 附件端点（typert） | 客户端 `conversation.createDrafts()` + `composer.addAttachments()` |
| 宿主半区 | 4 个 typert 端点（status/support/save/routes） | 空壳（只用来把包收进 profile 的 bundle 层） |
| 视觉模型判定 | 实时查模型表，不收图就自动切视觉模型，并给「切回」 | 不做判定，直接挂图片附件；附件失败时改为下载 PNG |
| PNG 落盘 | 总是写 `<workspace>/.dsh-drafts/*.png` | 不落盘，只进输入框 |
| 依赖 | `@deepseek-ai/dsh-typert-protocol`、`schemastery` | 无（零依赖） |

上游那套「实时判定 + 自动切模型」本身是好的设计，只是它依赖的传输层已经没了。
如果以后有人把 typert 端点按 0.2.x 重新接上，这块可以再补回来。

---

## 安装

```bash
# 从 GitHub
dsh plugin --profile web add github:dyguests/dsh-sketch-draft

# 或本地目录（开发时用，改完不用重装）
dsh plugin --profile web add file:/absolute/path/to/dsh-sketch-draft
```

装完**重启 dsh**（宿主半区只在启动时装载），刷新页面。

> npm 上没有这个 fork：`dsh-sketch-draft` 这个名字属于上游 LLYlab，本仓库只通过
> GitHub 分发。

## 用法

1. 点输入框左边的铅笔
2. 画：5 种颜色、4 档线宽（2/4/8/16px）、撤销、清空，`Esc` 关闭（点遮罩也关）
3. 点「导入」→ 图片作为附件进输入框，紧接着就能发送
4. 万一附件通道被拒，会自动降级成**下载 PNG**，并如实说明，不假装成功

画布逻辑尺寸 1000×620，导出 PNG 按浏览器 DPR 无关的固定像素，显示时按容器等比缩放。

## 已知边界

- **不判断模型是否收图**。当前模型不收图时，挂上去会在发送阶段被宿主拒绝，
  不会在画布阶段提前拦。
- **不落盘**。想要归档请在导入后自己保存，或改 `lib/client.js` 的 `deliver()`。
- 画布是自包含的预打包 bundle（`window.__ModuleLoader__.load` 的 lazy CJS 形态），
  改代码直接改 `lib/client.js`，不需要构建步骤。

## 许可

MIT。上游版权归 LLYlab（见 [LICENSE](./LICENSE)）；本 fork 的改动物保留同样的许可。
