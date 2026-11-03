/**
 * 端到端：真的点「选择文件…」，看它能不能把文件换成片头背景。
 *
 * 这一条链路上有三个环节（页面选文件 → 宿主收字节落盘 → /asset 真的服务新文件），
 * 任何一环断了都只有重启 DSH 才会发现，所以这里用真 Edge 走一遍：
 *
 *   1. 把 apply() 注册的五条路由挂到一个临时 http server 上（就是同源控制页的环境）；
 *   2. 打开 /dsh-star-boot/panel，用 setInputFiles 往隐藏的 file input 里塞一张真图；
 *   3. 断言：配置里的路径指向 star-boot-assets、文件真的存在、/asset 返回 200 且字节对得上。
 *
 * DSH_HOME 指向临时目录，跑完就删，不碰本机设置。
 *
 * 用法：node test/panel.mjs
 */

import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from 'node:fs'
import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures.push(label)
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const sandbox = mkdtempSync(join(tmpdir(), 'star-boot-e2e-'))
process.env.DSH_HOME = sandbox

const { apply } = await import('../lib/index.js')

const routes = []
apply({
  on() {},
  inject(_dependencies, body) {
    body({
      effect: (fn) => fn(),
      webServer: {
        register(route) {
          routes.push(route)
          return () => {}
        },
      },
    })
  },
})

const server = createServer(async (req, res) => {
  const url = new URL(String(req.url), 'http://127.0.0.1')
  // 浏览器自己会来要 favicon，别让它污染「页面没有报错」这条断言。
  if (url.pathname === '/favicon.ico') {
    res.writeHead(204).end()
    return
  }
  const route = routes.find((item) => item.path === url.pathname)
  if (route === undefined) {
    res.writeHead(404).end('no')
    return
  }
  await route.handler(req, res)
})
await new Promise((done) => server.listen(0, '127.0.0.1', done))
const port = server.address().port

const require = createRequire('C:/Users/25240/.dsh/profiles/desktop/package.json')
const { chromium } = require(process.env.STAR_BOOT_PLAYWRIGHT ?? 'C:/Users/25240/.dsh/profiles/desktop/node_modules/playwright')
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1000, height: 1200 } })
const errors = []
page.on('pageerror', (error) => errors.push(String(error.message)))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(message.text())
})

await page.goto(`http://127.0.0.1:${String(port)}/dsh-star-boot/panel`, { waitUntil: 'load' })

const source = new URL('../assets/hero.webp', import.meta.url).pathname.replace(/^\//, '')
await page.setInputFiles('#bg-file', source)
await page.waitForTimeout(1200)

const state = await page.evaluate(async () => {
  const answer = await fetch('/dsh-star-boot/config', { cache: 'no-store' })
  const config = await answer.json()
  const asset = await fetch('/dsh-star-boot/asset?slot=bg')
  const bytes = (await asset.arrayBuffer()).byteLength
  return {
    path: config.assets.bg,
    usable: config.slots.bg.usable,
    status: asset.status,
    type: asset.headers.get('content-type'),
    bytes,
    field: document.getElementById('bg-path').value,
    note: document.getElementById('asset-note').textContent,
  }
})

const stored = join(sandbox, 'star-boot.json')
check('配置里指向 star-boot-assets', String(state.path).includes('star-boot-assets'), state.path)
check('文件真的落在 DSH_HOME 下', typeof state.path === 'string' && existsSync(state.path))
check(
  '落盘大小和源图一致',
  typeof state.path === 'string' && existsSync(state.path) && statSync(state.path).size === statSync(source).size,
)
check('/asset 服务的是新图', state.status === 200 && state.type === 'image/webp', `${String(state.status)} ${String(state.type)}`)
check('/asset 字节数对得上', state.bytes === statSync(source).size, `${String(state.bytes)} vs ${String(statSync(source).size)}`)
check('路径框回填了新路径', state.field === state.path, String(state.field))
check('页面给了反馈', state.note.includes('背景'), state.note)
check('配置落到了 star-boot.json', existsSync(stored) && JSON.parse(readFileSync(stored, 'utf8')).assets.bg === state.path)

// 换掉：旧的那份应当被收走
const second = source
await page.setInputFiles('#bg-file', second)
await page.waitForTimeout(1200)
check('再选一次旧文件被清掉', !existsSync(state.path), state.path)

check('页面没有报错', errors.length === 0, errors.join(' | '))

await browser.close()
server.close()
rmSync(sandbox, { recursive: true, force: true })

console.log(failures.length === 0 ? '\nall good' : `\n${String(failures.length)} failed`)
process.exitCode = failures.length === 0 ? 0 : 1
