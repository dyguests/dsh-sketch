# Changelog

## v1.0.0 — 从 DET 拆出来的第一版

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
