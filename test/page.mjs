/**
 * 设置页那一半的取证：不用真 React，也不起 DSH。
 *
 * 客户端工件是普通脚本，执行时只认两样东西——`window.__ModuleLoader__` 和一个
 * 能给出 React 的 require。于是这里塞一个最小 React 桩（createElement 造纯对象、
 * hooks 返回初值），把 apply() 登记进槽位的组件真的调用一遍：
 *
 *   1. 工件仍然以包名登记（id 必须等于包名，否则装载器找不到 factory）；
 *   2. 槽位不存在时 apply 不抛（这条是 2026-11-02 崩启动的根因）；
 *   3. 「星图开机」页能构建出元素树，且素材行有两个 file 选择器。
 *
 * 它验不出样式好不好看，但能拦住「引用了个不存在的名字」这种必崩的改动。
 *
 * 用法：node test/page.mjs
 */

import { readFileSync } from 'node:fs'

const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures.push(label)
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* ---------- 最小运行环境 ---------- */

const store = new Map([['dsh-star-boot:mode', 'off']])
const specs = []

globalThis.window = {
  location: { search: '' },
  localStorage: {
    getItem: (key) => (store.has(key) ? store.get(key) : null),
    setItem: (key, value) => store.set(key, String(value)),
    removeItem: (key) => store.delete(key),
  },
  __ModuleLoader__: {
    load(spec) {
      specs.push(spec)
    },
  },
  addEventListener() {},
  removeEventListener() {},
}
globalThis.document = {
  getElementById: () => null,
  querySelector: () => null,
  createElement: () => ({ style: {} }),
}

function reactStub() {
  const h = (type, props, ...children) => ({ type, props: props ?? {}, children })
  return {
    createElement: h,
    useState: (initial) => [typeof initial === 'function' ? initial() : initial, () => {}],
    useCallback: (fn) => fn,
    useEffect: () => {},
    useMemo: (fn) => fn(),
    useRef: (value) => ({ current: value }),
  }
}

/* ---------- 执行工件 ---------- */

new Function(readFileSync(new URL('../lib/client.js', import.meta.url), 'utf8'))()

console.log('bundle')
check('工件登记了自己', specs.length === 1, String(specs.length))
const spec = specs[0]
check('id 等于包名', spec.id === 'dsh-star-boot', String(spec.id))
check('factory 是个函数', typeof spec.factory === 'function')

const exports = spec.factory(() => reactStub())

/* ---------- 槽位缺失时不许抛 ---------- */

console.log('apply')
const captured = []
try {
  exports.apply({
    slots: {
      inject(_name, callback) {
        callback()
        return () => {}
      },
      register(option, component) {
        captured.push({ option, component })
        return () => {}
      },
    },
    effect() {},
    on() {},
  })
  check('apply 不抛', true)
} catch (error) {
  check('apply 不抛', false, String((error && error.message) || error))
}
check('登记了两个入口', captured.length === 2, String(captured.length))
check(
  '一个是设置行、一个是独立页',
  captured.some((item) => item.option.name === 'settings.general.item') &&
    captured.some((item) => item.option.name === 'settings.section'),
)

/* ---------- 组件能构建 ---------- */

const strings = (node, out) => {
  if (node === null || node === undefined || typeof node === 'boolean') return out
  if (typeof node === 'string' || typeof node === 'number') {
    out.push(String(node))
    return out
  }
  if (Array.isArray(node)) {
    for (const child of node) strings(child, out)
    return out
  }
  if (Array.isArray(node.children)) strings(node.children, out)
  return out
}

const walk = (node, visit) => {
  if (node === null || node === undefined || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const child of node) walk(child, visit)
    return
  }
  if (node.props !== undefined) visit(node)
  if (Array.isArray(node.children)) walk(node.children, visit)
}

for (const item of captured) {
  const label = `${item.option.name}:${String(item.option.id)}`
  const isPage = item.option.name === 'settings.section'
  let tree = null
  try {
    tree = item.component()
    check(`${label} 构建成功`, tree !== null && tree !== undefined)
  } catch (error) {
    check(`${label} 构建成功`, false, String((error && error.message) || error))
    continue
  }
  const text = strings(tree, []).join(' ')
  check(`${label} 有标题`, text.includes('星图开机'))
  let files = 0
  let sliders = 0
  walk(tree, (node) => {
    if (node.props.type === 'file') files += 1
    if (node.props.type === 'range') sliders += 1
  })
  if (isPage) {
    // 独立页是完整的一套：两个素材槽 + 五个外观滑杆 + 七条文案。
    check(`${label} 有 file 选择器`, files >= 2, String(files))
    check(`${label} 有滑杆`, sliders >= 3, String(sliders))
    check(`${label} 文案齐全`, ['名字', '眉标', '立体字', '音效'].every((word) => text.includes(word)))
    check(`${label} 有导入按钮`, text.includes('选择文件'))
  } else {
    // 「通用」里那一行只放模式 + 素材 + 预览，不重复整套控件。
    check(`${label} 有模式开关`, ['关闭', '简洁', '状态卡'].every((word) => text.includes(word)))
    check(`${label} 有预览`, text.includes('预览'))
  }
}

console.log(failures.length === 0 ? '\nall good' : `\n${String(failures.length)} failed`)
process.exitCode = failures.length === 0 ? 0 : 1
