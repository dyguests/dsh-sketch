// 针对「整条交付链挂在宿主端点上」这次事故的回归守卫。
//
// 这个文件不渲染界面，只做三件事：
//   1. 用假的 __ModuleLoader__ 装载 lib/client.js（和浏览器同一条装载路径）；
//   2. 断言 apply() 只往 conversation.input.left 注册按钮、并且真的注册了；
//   3. 断言 bundle 里**没有任何** RPC / typert 调用 —— 上游就是死在
//      `rpc.call("/api", "dshSketchDraft/support")` 上的（endpoint 不允许斜杠）。
//
// 跑：node --test test/

import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const here = dirname(fileURLToPath(import.meta.url))
const clientPath = join(here, '..', 'lib', 'client.js')

const ReactStub = {
  Fragment: Symbol('Fragment'),
  createElement: () => ({ type: 'stub' }),
  useRef: (v) => ({ current: v }),
  useState: (v) => [typeof v === 'function' ? v() : v, () => {}],
  useEffect: () => {},
}

const ReactDOMStub = { createPortal: (node) => node }

/** 装载 bundle，返回 { registration, exports }。 */
function loadBundle() {
  const registration = { id: undefined, factory: undefined }
  globalThis.window = {
    __ModuleLoader__: {
      load(reg) {
        registration.id = reg.id
        registration.factory = reg.factory
      },
    },
  }
  // 同一个 realm 里执行，和浏览器加载 client.js 等价
  new Function(readFileSync(clientPath, 'utf8'))()
  assert.ok(registration.factory, 'bundle 没有注册 factory')
  const exports = registration.factory((name) => {
    if (name === 'react') return ReactStub
    if (name === 'react-dom') return ReactDOMStub
    throw new Error('unexpected require: ' + name)
  })
  return { registration, exports }
}

function makeCtx() {
  const registered = []
  const commands = []
  return {
    registered,
    commands,
    // cordis 服务注入：本插件只用 commandUi 一个
    inject(names, factory) {
      assert.deepEqual(names, ['commandUi'])
      factory({
        get(name) {
          assert.equal(name, 'commandUi')
          return {
            register(contribution) {
              commands.push(contribution)
              return () => {}
            },
          }
        },
        effect(run) {
          run()
          return () => {}
        },
      })
    },
    slots: {
      inject(name, factory) {
        assert.equal(name, 'conversation.input.left')
        factory()
      },
      register(def, component) {
        registered.push({ def, component })
      },
    },
    sessions: { list: { getSnapshot: () => ({ byId: {} }) } },
    get: () => undefined,
  }
}

const { registration, exports } = loadBundle()

/** 去掉行注释与块注释，只留下真正会执行的代码文本。 */
function stripComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n')
}

test('bundle 身份与上游一致（同一套装载契约）', () => {
  assert.equal(registration.id, 'dsh-sketch-draft')
  assert.equal(exports.name, 'dsh-sketch-draft')
  assert.equal(typeof exports.apply, 'function')
  assert.deepEqual(exports.inject, ['slots', 'sessions'])
})

test('apply() 往「+」菜单注册一个 sketch 动作', () => {
  const ctx = makeCtx()
  exports.apply(ctx)
  assert.equal(ctx.commands.length, 1)
  const action = ctx.commands[0]
  assert.equal(action.name, 'sketch')
  assert.equal(action.ui.kind, 'action')
  assert.equal(typeof action.ui.run, 'function')
  assert.equal(typeof action.label(), 'string')
  assert.equal(typeof action.description(), 'string')
  assert.equal(typeof action.icon, 'function', '菜单行需要传图标组件，否则图标位是空的')
  assert.equal(action.available({ sessionId: 'any' }), true)
})

test('画布仍挂在 conversation.input.left 上（菜单唤起它）', () => {
  const ctx = makeCtx()
  exports.apply(ctx)
  assert.equal(ctx.registered.length, 1)
  assert.equal(ctx.registered[0].def.name, 'conversation.input.left')
  assert.equal(ctx.registered[0].def.id, 'dsh-sketch-draft')
  assert.equal(typeof ctx.registered[0].component, 'function')
})

test('不碰宿主 RPC：没有 rpc / typert / connection 调用', () => {
  // 只扫代码，不扫注释 —— 文件头注释里为了解释事故经过，确实写着
  // `rpc.call("/api", …)` 这个反面例子。
  const code = stripComments(readFileSync(clientPath, 'utf8'))
  for (const forbidden of ['rpc.call', 'connection', 'typert', '/api']) {
    assert.equal(code.includes(forbidden), false, 'bundle 的代码里不该出现 ' + forbidden)
  }
})

test('交付链只用客户端的两个附件 API', () => {
  const src = readFileSync(clientPath, 'utf8')
  for (const required of ['createDrafts', 'addAttachments', 'releaseDraftAttachments']) {
    assert.ok(src.includes(required), '缺少 ' + required)
  }
})

test('样式带归属，不与其它插件抢 DOM', () => {
  const src = readFileSync(clientPath, 'utf8')
  assert.ok(src.includes('data-plugin-css'))
  assert.ok(src.includes('.dsd-'), '类名应统一 dsd- 前缀')
})
