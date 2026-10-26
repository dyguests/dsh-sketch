# dsh-sketch-draft

> 输入框「+」旁边的一个小铅笔：**现画一张草图，直接作为图片注入对话。**

DSH（DeepSeek Harness）永久插件。从 [DET / dsh-essential-tools](https://github.com/LLYlab/DSHEssentialTools)
的草图功能里拆出来单独发布 —— 因为它其实**不需要 DET 的任何东西**，而拆出来之后：

- 不想装 DET 的人也能用（**零 DET 依赖**，独立可用）；
- DET 可以卸掉自己那份，同一个按钮不再有两份实现；
- 草图这条链上的修复能**独立发版**，不必跟着大插件走。

---

## 它解决什么

大部分情况下，「画一张图给模型看」最快的路径就是**画**——比截图、比找文件、比让模型去读图片都快。
但这条路上有三个坑，这个包把三个都填了：

| 坑 | 做法 |
|---|---|
| 当前模型不收图，挂上去发送时才被宿主拒（`MODEL_DOES_NOT_SUPPORT_IMAGES`） | 导入前**实时**查模型表；不收图就自动切到一个能看图的模型，再作为**图片附件**注入，并给一个「切回 <原模型>」 |
| 判定用的是**上一轮**的模型（画布开着时换了模型，判断却是旧的） | 模型取自**会话投影的 `pending`**（用户刚在模型选择器里选的、还没跑的那个），不是 `request/header`（已经跑过的那一轮） |
| 「点了导入，结果只是插了一行路径」 | 主按钮**如实写明**这次要做什么（`导入为图片` / `切到视觉模型并导入` / `存 PNG 并插入路径`）；交付失败也如实回报，不谎报成功 |

## 安装

```bash
# 从 npm
dsh plugin --profile web add dsh-sketch-draft

# 或从 GitHub
dsh plugin --profile web add github:LLYlab/DSHSketchDraft
```

**还没发布 / 想直接用本地这份源码**，用自带的安装器（默认 dry-run）：

```powershell
.\install.ps1 -Local            # 预览：建 junction + 写注册块
.\install.ps1 -Local -Go        # 真的装（写前自动备份 cordis.patch.yml）
.\install.ps1 -Local -Go -Uninstall   # 反安装
```

装完**必须重启 DSH**（宿主半区在启动时装载）。装好后，输入框「+」旁边会出现铅笔按钮。

画布：5 种颜色、4 档线宽、撤销、清空，`Esc` 关闭。
草图**总会**落一份 PNG 到磁盘：`<会话工作区>/.dsh-drafts/sketch-YYYYmmdd-HHMMSS.png`。

## 发布

```powershell
.\publish.ps1                   # dry-run：跑测试 + npm pack 预览，什么都不发
.\publish.ps1 -Go               # 真的发（npm publish；有 git remote 才推 GitHub）
.\publish.ps1 -Go -OnlyNpm      # 只发 npm，完全不碰 git
```

脚本刻意做两件事：**默认 dry-run**；以及 **git 与 npm 解耦** —— 本目录刚拆出来时还不是
git 仓库，脚本会 `git init` 并做首次提交，但没有 remote 时**不会假装推成功**，
只明确告诉你先 `git remote add` 再重跑。测试不过就不发布。

## 判定是实时的（这一条是重点）

「当前模型收不收图」由宿主的**模型表**（`inputModalities` 是否含 `image`）决定，
「当前模型是哪个」由**会话投影**决定：

```text
模型 = sessionProjections.stateOf(session, "modelSelection")
       → pending（用户刚选、下一次请求要用）      ← 首选
       ?? lastUsed（最近真正跑过的那一轮）         ← 其次
     再退事件日志里最后一条 model/selection / request/header
     再退宿主默认模型
收图 = llm.resolveModelInfo(provider, model).inputModalities 含 "image"
```

两个「不猜」的约定：

- 拿不到模型信息 → **按「收不了图」处理**（退回存 PNG + 插路径），绝不在发送时才失败；
- 客户端**不复用**打开画布那一刻的结论：每次点「导入」都重新问一遍宿主，
  所以画布开着的时候换模型，立刻就被看见。

## 与 DET 的关系（单拥有者）

如果你同时装了 DET，**输入框旁只会有一个铅笔**：

```text
DET 在场 且 DET 的「草图导入」开着   →  本包让位（一个插槽都不注册）
否则（没装 DET / DET 总开关关闭 / DET 关了自己的草图） →  本包全责
```

让位方向只有一条（本包看 DET 的声明），所以不会互相抢。
配置里可以改：

```yaml
- id: dsh-sketch-draft
  config:
    deferToDet: auto     # auto（默认）| never（永不让位）| always（DET 在场就让位）
    enabled: true
    dirName: .dsh-drafts
    canvasWidth: 960
    canvasHeight: 600
    maxBytes: 8388608
```

想用本包而不是 DET 那一份：把 DET 管理器里「DLT 集成 → 草图导入」关掉即可
（本包会自动接手，不必重启）。

## 端点

宿主半区注册 `dshSketchDraft` 服务与四个 typert 端点：

| 端点 | 作用 |
|---|---|
| `status` | 本包此刻是否在让位、被谁让位、端点是否可用 |
| `support` | **实时**回答「这个会话当前的模型收不收图」+ 原因 |
| `save` | 画布 PNG 落盘（魔数校验 / 体积上限 / 路径收窄 / 同名不覆盖） |
| `routes` | 逐个模型**实时**查模型表，列出能收图的模型 |

## 从源码跑测试

```bash
cd <repo>
node tests/sketch-draft.test.mjs        # 84 项断言（host 端点 + client bundle 真装载）
```

测试不联网、不启服务、不写系统目录：所有宿主服务都是假的，client bundle 在一个
假 `__ModuleLoader__` + 假 `require` 下**真执行**，并在「被让位 / 不被让位」两种状态下
分别验证它到底挂不挂那个按钮。

## 安全边界

- 落盘**只允许**写进本会话工作区（外部 `dir` 一律忽略并如实回报）；
- 只接受画布导出的 PNG（校验 PNG 魔数），并受 `maxBytes` 上限约束；
- 同名不覆盖（自动加 `-2` / `-3` 后缀）；
- 客户端半区不做整页刷新、不修改他人的 DOM 与样式（样式全部限定在 `dsd-*` 前缀下）。

## 许可

MIT
