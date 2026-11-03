/**
 * 预览 / 取证脚本。
 *
 * 不启动 DSH：起一个最小的 HTTP 服务，把「DSH 会送到浏览器的那些东西」按真实顺序
 * 拼出来——<head> 里的第一帧 style+script（直接取自 lib/index.js 的导出）、
 * 一张模仿 shell 的启动卡、然后才加载客户端插件。这样能验的正是真正会出问题的
 * 两件事：第一帧有没有被盖住、动画在浏览器里长什么样。
 *
 * 用法：
 *   node test/preview.mjs [输出目录]
 *
 * 环境变量：
 *   STAR_BOOT_SCHEME=star|warm|violet|ice   配色
 *   STAR_BOOT_PACE=fast|normal|slow         节奏
 *   STAR_BOOT_NO_CARD=1                     模拟桥接不可用
 *   STAR_BOOT_PRESS=enter                   在授权页停住后按 Enter（验「推进」）
 *
 * 需要 Playwright（在 DSH 的 desktop profile 里），浏览器用系统 Edge，不下载。
 */

import { createServer } from 'node:http'
import { mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

import { firstFrame } from '../lib/index.js'

const here = dirname(fileURLToPath(import.meta.url))
const root = resolve(here, '..')
const scheme = process.env.STAR_BOOT_SCHEME ?? 'star'
const pace = process.env.STAR_BOOT_PACE ?? 'normal'
const press = process.env.STAR_BOOT_PRESS ?? ''
const reduced = process.env.STAR_BOOT_REDUCED === '1'
/** 任意额外设置：JSON，键是 localStorage 键（不带前缀也行）。 */
const extra = process.env.STAR_BOOT_STORE ? JSON.parse(process.env.STAR_BOOT_STORE) : {}
const suffix = [scheme, pace, process.env.STAR_BOOT_NO_CARD === '1' ? 'nocard' : '', press, process.env.STAR_BOOT_TAG ?? '']
  .filter(Boolean)
  .join('-')
const outDir = resolve(process.argv[2] ?? join(root, '..', '..', 'tmp', 'star-boot-' + suffix))
mkdirSync(outDir, { recursive: true })

const require = createRequire(import.meta.url)
const PLAYWRIGHT =
  process.env.STAR_BOOT_PLAYWRIGHT ?? 'C:/Users/25240/.dsh/profiles/desktop/node_modules/playwright'
const { chromium } = require(PLAYWRIGHT)

const SAMPLE_CARD = {
  ok: true,
  role: '独立AI',
  mood: { emotion: '好奇', intensity: 3, reason: '刚刷到一批新视频' },
  moodLong: null,
  stress: 0,
  memories: { total: 106, core: 12, long: 75, short: 19 },
  people: 16,
  closest: { name: '只帆船', score: 100 },
}

const html = `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>star-boot preview</title>
<style>html,body{margin:0;height:100%;background:#04070f;color:#dfe9ff;font-family:system-ui}
[data-dsh-boot]{position:fixed;inset:0;display:flex;align-items:center;justify-content:center;gap:10px;
  font-size:13px;color:#6b7794;letter-spacing:.08em}
[data-dsh-boot] i{width:12px;height:12px;border:2px solid #2a3550;border-top-color:#7c96c8;border-radius:50%}</style>
<style>${firstFrame.css}</style>
<script>${firstFrame.script}</script>
</head>
<body>
<div data-dsh-boot><i data-dsh-boot-spinner></i><span>HARNESS · Loading plugins…</span></div>
<script>
  // DSH 的模块装载器只需要这三件事：登记 id、把 require 传进去、拿 factory 的返回值。
  window.__ModuleLoader__ = {
    load(spec) {
      window.__starSpecId = spec.id;
      const req = () => ({ createElement() { return null } });
      try { window.__starModule = spec.factory(req) } catch (error) { window.__starBootError = String(error && error.stack || error) }
    }
  };
</script>
<script src="/client.js"></script>
</body>
</html>`

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://127.0.0.1')
  if (url.pathname === '/' || url.pathname === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(html)
    return
  }
  if (url.pathname === '/client.js') {
    res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8' }).end(readFileSync(join(root, 'lib', 'client.js')))
    return
  }
  if (url.pathname === '/dsh-star-boot/asset') {
    const slot = url.searchParams.get('slot') === 'audio' ? 'audio' : 'bg'
    // STAR_BOOT_ASSET 可以指向任意本机图片/视频，用来验「换成视频后文字还在不在」。
    const custom = slot === 'audio' ? process.env.STAR_BOOT_AUDIO : process.env.STAR_BOOT_ASSET
    if (custom) {
      const ext = custom.slice(custom.lastIndexOf('.')).toLowerCase()
      const mime =
        ext === '.mp4' ? 'video/mp4' : ext === '.webm' ? 'video/webm' : ext === '.mp3' ? 'audio/mpeg' : `image/${ext.replace('.', '')}`
      const buf = readFileSync(custom)
      // 和真宿主一样支持 Range：mp4 的 moov 常在尾部，播放器要靠它跳过去。
      const range = req.headers.range
      const match = typeof range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
      if (match !== null && (match[1] !== '' || match[2] !== '')) {
        let start = match[1] === '' ? Math.max(0, buf.length - Number(match[2])) : Number(match[1])
        let end = match[1] === '' || match[2] === '' ? buf.length - 1 : Math.min(Number(match[2]), buf.length - 1)
        if (start > end) {
          res.writeHead(416).end()
          return
        }
        res.writeHead(206, {
          'content-type': mime,
          'content-length': String(end - start + 1),
          'content-range': `bytes ${String(start)}-${String(end)}/${String(buf.length)}`,
          'accept-ranges': 'bytes',
        })
        res.end(buf.subarray(start, end + 1))
        return
      }
      res.writeHead(200, { 'content-type': mime, 'accept-ranges': 'bytes' }).end(buf)
      return
    }
    if (slot === 'audio') {
      res.writeHead(404).end('no audio')
      return
    }
    res.writeHead(200, { 'content-type': 'image/webp', 'accept-ranges': 'bytes' }).end(readFileSync(join(root, 'assets', 'hero.webp')))
    return
  }
  if (url.pathname === '/dsh-star-boot/config') {
    // 设置页/控制页要的那份状态；预览只回一个"什么都没配"的诚实版本（除非给了音频）。
    const audioPath = process.env.STAR_BOOT_AUDIO ?? null
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' })
    res.end(
      JSON.stringify({
        ok: true,
        assets: { bg: null, audio: audioPath },
        slots: {
          bg: { path: null, usable: true, effective: 'hero.webp', packed: true, reason: null, bytes: null, mime: 'image/webp' },
          audio: {
            path: audioPath,
            usable: audioPath !== null,
            effective: audioPath,
            packed: false,
            reason: null,
            bytes: null,
            mime: audioPath === null ? null : 'audio/wav',
          },
        },
        asset: null,
        effective: 'hero.webp',
        fallback: true,
        reason: null,
      }),
    )
    return
  }
  if (url.pathname === '/dsh-star-boot/card') {
    if (process.env.STAR_BOOT_NO_CARD === '1') {
      res.writeHead(503, { 'content-type': 'application/json; charset=utf-8' }).end('{"ok":false,"error":"bridge down"}')
      return
    }
    res.writeHead(200, { 'content-type': 'application/json; charset=utf-8' }).end(JSON.stringify(SAMPLE_CARD))
    return
  }
  res.writeHead(404).end('no')
})

await new Promise((done) => server.listen(0, '127.0.0.1', done))
const port = server.address().port

const browser = await chromium.launch({ channel: 'msedge', headless: true })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 })

// 设置项存在 localStorage，所以在导航前先写好。
await page.addInitScript(
  ([schemeValue, paceValue, textValue, overlayValue, extraValue]) => {
    try {
      window.localStorage.setItem('dsh-star-boot:scheme', schemeValue)
      window.localStorage.setItem('dsh-star-boot:pace', paceValue)
      window.localStorage.setItem('dsh-star-boot:auth', 'on')
      window.localStorage.setItem('dsh-star-boot:mode', 'card')
      window.localStorage.setItem('dsh-star-boot:overlay', overlayValue)
      if (textValue) window.localStorage.setItem('dsh-star-boot:text', JSON.stringify(textValue))
      // STAR_BOOT_STORE 里的每一项都塞进 localStorage：键可以不带 dsh-star-boot: 前缀。
      Object.keys(extraValue).forEach((key) => {
        const full = key.indexOf(':') > 0 ? key : 'dsh-star-boot:' + key
        window.localStorage.setItem(full, String(extraValue[key]))
      })
    } catch (error) {
      /* preview 里不该失败 */
    }
  },
  [
    scheme,
    pace,
    process.env.STAR_BOOT_TEXT ? JSON.parse(process.env.STAR_BOOT_TEXT) : null,
    process.env.STAR_BOOT_OVERLAY ?? 'on',
    extra,
  ],
)

const errors = []
page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`))
page.on('console', (message) => {
  if (message.type() === 'error') errors.push(`console: ${message.text()}`)
})
// 哪个资源 404 了——没有 URL 的控制台报错基本等于没报。
page.on('response', (response) => {
  if (response.status() >= 400) errors.push(`http ${String(response.status())} ${response.url()}`)
})

if (reduced) await page.emulateMedia({ reducedMotion: 'reduce' })
await page.goto(`http://127.0.0.1:${String(port)}/`, { waitUntil: 'load' })

// 「减少动画」是最容易被忽略的路径：系统一开，片头会被压成静态一闪。
// 这里真的把媒体特性模拟出来，用两个时间点判定：1.4 秒时必须在，4 秒后必须走。
if (reduced) {
  const present = () => page.evaluate(() => document.querySelector('.star-splash-host') !== null)
  await page.waitForTimeout(1400)
  const early = await present()
  console.log('reduced: +1.4s 还在吗 ->', early)
  await page.waitForTimeout(2600)
  const late = await present()
  console.log('reduced: +4.0s 已退场吗 ->', late === false)
  if (early !== true) {
    console.log('FAIL: 减少动画时片头 1.4 秒内就没了（应该至少 1.5 秒）')
    process.exitCode = 1
  } else if (late !== false) {
    console.log('FAIL: 减少动画时片头 4 秒了还没退场')
    process.exitCode = 1
  } else {
    console.log('ok: 减少动画时片头停够 2 秒后再退场')
  }
}

const shot = async (label) => {
  await page.screenshot({ path: join(outDir, `frame-${label}.png`) })
}

const t0 = Date.now()
const marks = [220, 700, 1300, 2400, 3800, 4600, 5400, 6800]
// 换成视频时多等几秒：默认「素材跟播」会把片头延长到片子播完（最多 15 秒）。
if (process.env.STAR_BOOT_ASSET) marks.push(10600)
let waited = 0
for (const mark of marks) {
  await page.waitForTimeout(mark - waited)
  waited = mark
  await shot(String(mark).padStart(4, '0'))
  if (mark === 1300) {
    const markProbe = await page.evaluate(() => {
      const host = document.querySelector('.star-splash-host')
      if (host === null || host.shadowRoot === null) return { gone: true }
      const root = host.shadowRoot
      const el = root.getElementById('mark')
      const inner = root.getElementById('markInner')
      const veil = inner === null ? null : inner.querySelector('.mk-veil')
      const face = inner === null ? null : inner.querySelector('.mk-face')
      return {
        cls: el === null ? null : el.className,
        op: el === null ? null : getComputedStyle(el).opacity,
        style: host.getAttribute('data-mark-style'),
        varOp: getComputedStyle(host).getPropertyValue('--mark-op'),
        veil: veil === null ? null : { w: veil.offsetWidth, h: veil.offsetHeight, blurred: getComputedStyle(veil).filter },
        face: face === null ? null : { color: getComputedStyle(face).color, fill: getComputedStyle(face).backgroundImage.slice(0, 46) },
      }
    })
    console.log('markprobe:', JSON.stringify(markProbe))
  }
  if (mark === 2400) {
    const bgProbe = await page.evaluate(() => {
      const host = document.querySelector('.star-splash-host')
      if (host === null || host.shadowRoot === null) return { gone: true }
      const root = host.shadowRoot
      const shot = root.getElementById('shot')
      const img = shot === null ? null : shot.querySelector('img')
      const video = shot === null ? null : shot.querySelector('video')
      const audioNode = root.querySelector('audio')
      return {
        shot: shot === null ? null : { cls: shot.className, op: getComputedStyle(shot).opacity },
        img:
          img === null
            ? null
            : { w: img.naturalWidth, src: img.getAttribute('src'), filter: getComputedStyle(img).filter, fit: getComputedStyle(img).objectFit },
        video:
          video === null
            ? null
            : {
                src: video.currentSrc,
                readyState: video.readyState,
                networkState: video.networkState,
                error: video.error === null ? null : { code: video.error.code, message: video.error.message },
                w: video.videoWidth,
                h: video.videoHeight,
                paused: video.paused,
                time: Math.round(video.currentTime * 100) / 100,
              },
        audio:
          audioNode === null
            ? null
            : {
                src: audioNode.getAttribute('src'),
                paused: audioNode.paused,
                volume: audioNode.volume,
                error: audioNode.error === null ? null : audioNode.error.code,
                time: Math.round(audioNode.currentTime * 100) / 100,
              },
        varOp: getComputedStyle(host).getPropertyValue('--shot-op'),
      }
    })
    console.log('bgprobe:', JSON.stringify(bgProbe))
  }
  if (mark === 6800) {
    const held = await page.evaluate(() => {
      const host = document.querySelector('.star-splash-host')
      const video = host === null || host.shadowRoot === null ? null : host.shadowRoot.querySelector('video')
      return {
        host: host !== null,
        time: video === null ? null : Math.round(video.currentTime * 10) / 10,
        duration: video === null || !Number.isFinite(video.duration) ? null : Math.round(video.duration * 10) / 10,
        ended: video === null ? null : video.ended,
      }
    })
    console.log('hold:', JSON.stringify(held))
  }
  if (mark === 5400) {
    const probe = await page.evaluate(() => {
      const host = document.querySelector('.star-splash-host')
      if (host === null || host.shadowRoot === null) return { gone: true }
      const root = host.shadowRoot
      const val = root.querySelector('.arow .val')
      const row = root.querySelector('.arow')
      const auth = root.getElementById('auth')
      const read = (el) => {
        if (el === null) return null
        const style = getComputedStyle(el)
        return { color: style.color, opacity: style.opacity, filter: style.filter }
      }
      return {
        scheme: host.getAttribute('data-scheme'),
        auth: read(auth),
        row: read(row),
        val: read(val),
      }
    })
    console.log('probe:', JSON.stringify(probe))
  }
}

// 「推进」：授权页停住时按 Enter，应当立刻开始溶解。
if (press === 'enter') {
  await page.keyboard.press('Enter')
  await page.waitForTimeout(360)
  await shot('press')
  waited += 360
}

await page.waitForTimeout(1800)
await shot('after')

const state = await page.evaluate(() => ({
  error: window.__starBootError ?? null,
  hosts: document.querySelectorAll('.star-splash-host').length,
  cover: document.documentElement.classList.contains('star-first'),
  // 工件 id 必须等于包名，否则装载器按名字找不到这个 factory。
  specId: window.__starSpecId ?? null,
  moduleName: window.__starModule?.name ?? null,
  hasApply: typeof window.__starModule?.apply === 'function',
  // 设置槽位不存在时（本机 profile 里 settings 就是 disabled），apply 必须不抛异常：
  // 一旦抛，DSH 会把「条目未激活」当致命错误，启动直接崩。
  applyWithoutSlot: (() => {
    try {
      window.__starModule.apply({ slots: { register() { throw new Error('slot not declared') } }, effect() {}, on() {} })
      return 'ok'
    } catch (error) {
      return String((error && error.message) || error)
    }
  })(),
  applyWithInject: (() => {
    let injected = false
    try {
      window.__starModule.apply({
        slots: {
          register() {
            return () => {}
          },
          inject(_name, callback) {
            injected = true
            callback()
            return () => {}
          },
        },
        effect() {},
        on() {},
      })
      return injected ? 'inject' : 'no-inject'
    } catch (error) {
      return String((error && error.message) || error)
    }
  })(),
  // 设置界面上两个入口：通用里的一行 + 左侧独立页。两个槽位都要登记。
  registeredSlots: (() => {
    const seen = []
    try {
      window.__starModule.apply({
        slots: {
          register(option) {
            seen.push(option.name + ':' + String(option.id))
            return () => {}
          },
          inject(_name, callback) {
            callback()
            return () => {}
          },
        },
        effect() {},
        on() {},
      })
      return seen.join('|')
    } catch (error) {
      return 'THROW ' + String((error && error.message) || error)
    }
  })(),
}))

await browser.close()
server.close()

console.log('out:', outDir)
console.log('scheme:', scheme, 'pace:', pace, 'press:', press || '-')
console.log('elapsed ms:', Date.now() - t0)
console.log('state:', JSON.stringify(state))
console.log('errors:', errors.length ? errors.join('\n') : 'none')
