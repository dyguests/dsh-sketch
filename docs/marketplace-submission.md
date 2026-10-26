# 提交到 dsh-plugin.org 的收录文案

> 依据 <https://dsh-plugin.org/zh/submit> 的模板填写。发完 npm、加完 topic 后，
> 打开 <https://github.com/dshplugin/dsh-plugin-hub/issues/new> 新建 Issue，
> 标题和正文直接粘下面的内容。

## 标题

```
[插件提交] dyguests/dsh-sketch — 输入框「+」菜单里画一张，直接作为图片附件进对话
```

## 正文

````markdown
### 仓库地址
<https://github.com/dyguests/dsh-sketch>

### 一句话价值
在 DSH 输入框的「+」菜单里加一个画板：随手画一张，直接作为图片附件放进对话，不用切到别的 app。

### 能力分类
界面与体验

### 安装命令
dsh plugin --profile web add dsh-sketch

### 兼容与运行要求
dsh >= 0.2.0（package.json 里 `engines.dsh` 为 `>=0.2.0-0 <0.3.0`），已在 0.2.1-rc.3 实测装载与使用；
纯前端插件，无平台限制，不依赖任何外部服务或 API key。

### 许可证
MIT

### 截图 / 演示
- 入口（「+」菜单里的「画一张」）：https://github.com/dyguests/dsh-sketch/blob/main/docs/menu.png
- 画布：https://github.com/dyguests/dsh-sketch/blob/main/docs/canvas.png
- 深色外观：https://github.com/dyguests/dsh-sketch/blob/main/docs/canvas-dark.png

### 补充说明
- 纯客户端交付：图片通过 `conversation.createDrafts()` + `composer.addAttachments()` 进输入框，
  不注册宿主端点、不开 HTTP 路由，不需要额外权限。
- 前身是 LLYlab 的 `dsh-sketch-draft` 1.0.0；那版的宿主 typert 端点在 dsh 0.2.1 上整条失效
  （RPC endpoint 不允许斜杠），本仓库把交付路径换成了客户端通道。
- 已知限制：不判断当前模型是否收图（不收图时会在发送阶段被宿主拒绝）；不落盘 PNG。
- 入口也支持 `/sketch`；文案跟随界面语言（中文「画一张」/ 英文「Sketch」）。

### 提交前自查
- [x] 仓库已公开
- [x] 已添加 GitHub topic：dsh-plugin
- [x] README 包含安装命令
- [x] 插件导出 apply(ctx) 模块
- [x] 仓库根目录包含 package.json
````

## 现在还差什么

1. **开 Issue**：正文已在上文，粘到
   <https://github.com/dshplugin/dsh-plugin-hub/issues/new>。
   仓库的 `dsh-plugin` topic 已经加好了。

2. **收录徽章已经加进 README 顶部了**（第四枚）。徽章图片本身是静态的，能正常渲染；
   它指向的详情页 `https://dsh-plugin.org/plugins/dyguests/dsh-sketch` 在收录前是 404，
   收录后自动生效，不用再改 README。

npm 已经发布（`dsh-sketch@1.4.2`），安装命令就是上面那条，插件中心能认。
