/**
 * 「换了素材，预览却没变」的回归测试。
 *
 * 现场是这样的：片头请求的素材地址对所有素材都是同一个 `/dsh-star-boot/asset`，
 * 浏览器按 max-age 把上一份缓存着，换完视频再预览还是那张旧图。
 *
 * 所以这里刻意把服务器做成**旧宿主那种长缓存**（`public, max-age=3600`），
 * 然后在同一个浏览器上下文里换掉素材、刷新页面——修好之后的客户端会给地址
 * 加一次性参数，于是第二次必须是新资源、必须出现 <video> 并且真的解码出画面。
 *
 * 用法：node test/cache.mjs
 */

import { createServer } from 'node:http'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { firstFrame } from '../lib/index.js'

const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures.push(label)
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

const root = resolve(new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'))
// 用仓库里随包的视频当素材，不再依赖用户 star-boot-assets 里那份（那边会被换掉）。
const VIDEO = process.env.STAR_BOOT_VIDEO ?? join(root, 'assets', 'default-bg.mp4')

/** 第一轮给图片，第二轮换成视频——地址不变，只有客户端加的参数会变。 */
let mode = 'image'

const html = `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>cache</title>
<style>html,body{margin:0;height:100%;background:#04070f}</style>
<style>${firstFrame.css}</style>
<script>${firstFrame.script}</script>
</head><body>
<script>
  window.__ModuleLoader__ = {
    load(spec) {
      const req = () => ({ createElement() { return null } });
      try { window.__starModule = spec.factory(req) } catch (error) { window.__starBootError = String(error) }
    }
  };
</script>
<script src="/client.js"></script>
</body></html>`

const server = createServer((req, res) => {
  const url = new URL(String(req.url), 'http://127.0.0.1')
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
    return
  }
  if (url.pathname === '/client.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(readFileSync(join(root, 'lib', 'client.js')))
    return
  }
  if (url.pathname === '/dsh-star-boot/card') {
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end('{"ok":false}')
    return
  }
  if (url.pathname === '/dsh-star-boot/config') {
    res
      .writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
      .end(JSON.stringify({ ok: true, assets: { bg: null, audio: null }, slots: { bg: {}, audio: {} } }))
    return
  }
  if (url.pathname === '/dsh-star-boot/asset') {
    // 故意学旧宿主：允许浏览器缓存一小时。
    const head = { 'cache-control': 'public, max-age=3600', 'accept-ranges': 'bytes' }
    if (mode === 'image') {
      res.writeHead(200, Object.assign({ 'content-type': 'image/webp' }, head)).end(readFileSync(join(root, 'assets', 'hero.webp')))
      return
    }
    const body = readFileSync(VIDEO)
    res.writeHead(200, Object.assign({ 'content-type': 'video/mp4', 'content-length': String(body.length) }, head)).end(body)
    return
  }
  res.writeHead(404).end('no')
})

await new Promise((done) => server.listen(0, '127.0.0.1', done))
const port = server.address().port

const require = createRequire(import.meta.url)
const { chromium } = require(
  process.env.STAR_BOOT_PLAYWRIGHT ?? 'C:/Users/25240/.dsh/profiles/desktop/node_modules/playwright',
)
const browser = await chromium.launch({ channel: 'msedge', headless: true })
const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
const page = await context.newPage()

const requests = []
page.on('request', (request) => {
  if (request.url().includes('/asset')) requests.push(request.url())
})

await page.goto(`http://127.0.0.1:${String(port)}/`, { waitUntil: 'load' })
await page.waitForTimeout(1600)

const firstShot = await page.evaluate(() => {
  const host = document.querySelector('.star-splash-host')
  if (host === null || host.shadowRoot === null) return { gone: true }
  const shot = host.shadowRoot.getElementById('shot')
  return { img: shot.querySelector('img') !== null, video: shot.querySelector('video') !== null }
})
check('第一轮是图片', firstShot.img === true && firstShot.video === false, JSON.stringify(firstShot))

// 换素材：同一地址，新的内容。
mode = 'video'
const before = requests.length
await page.reload({ waitUntil: 'load' })
await page.waitForTimeout(2600)

const second = await page.evaluate(() => {
  const host = document.querySelector('.star-splash-host')
  if (host === null || host.shadowRoot === null) return { gone: true }
  const shot = host.shadowRoot.getElementById('shot')
  const video = shot.querySelector('video')
  return {
    img: shot.querySelector('img') !== null,
    video:
      video === null
        ? null
        : { readyState: video.readyState, w: video.videoWidth, h: video.videoHeight, err: video.error && video.error.code },
  }
})
const secondRequests = requests.slice(before)

check('刷新后有新的素材请求', secondRequests.length > 0, String(secondRequests.length))
check(
  '地址带了一次性参数（不吃旧缓存）',
  secondRequests.some((url) => /[?&]v=\d+/.test(url)),
  secondRequests.join(' '),
)
check('第二轮挂的是 video', second.video !== null, JSON.stringify(second))
check('视频解码出了画面', second.video !== null && second.video.w > 0 && second.video.h > 0, JSON.stringify(second.video))
check('视频没报错', second.video !== null && second.video.err === null, JSON.stringify(second.video))

await browser.close()
server.close()

console.log(failures.length === 0 ? '\nall good' : `\n${String(failures.length)} failed`)
process.exitCode = failures.length === 0 ? 0 : 1
