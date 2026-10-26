# Changelog

## v1.1.0 — 换掉交付路径，让它在 dsh 0.2.1 上真的能导入

**这是一个 fork**（https://github.com/dyguests/dsh-sketch-draft），基于上游
[LLYlab/DSHSketchDraft](https://github.com/LLYlab/DSHSketchDraft) 1.0.0。上游的设计
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
