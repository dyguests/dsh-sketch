// dsh-sketch-draft — Host 半区。
//
// 上游 1.0.0 在这里注册四个 typert 端点（status / support / save / routes），
// 客户端靠它们判断「当前模型收不收图」，并把 PNG 落到 <workspace>/.dsh-drafts/。
// 那套端点建立在 typert 0.1.7 的传输上；dsh 0.2.1 的 endpoint 校验不再接受带斜杠
// 的方法名（/^[A-Za-z0-9_$.-]+$/），整条链接不上 —— 表现就是画布底部永远写着
// 「无法确认当前模型是否支持图片（support 端点不可用）」。
//
// 现在交付路径完全在客户端：
//   conversation.createDrafts(sessionId, [file])
//   conversation.input.shell(sessionId).addAttachments(ids)
// 宿主不需要做任何事。这个空壳只为一个原因存在：profile 只把「一层 bundle」的包
// 收进客户端 bundle，有这一层，package.json 的 dsh.client 才会被读到、
// lib/client.js 才会被挂进浏览器。

export const name = 'dsh-sketch-draft'
export const inject = []

export function apply() {}

export default { name, inject, apply }
