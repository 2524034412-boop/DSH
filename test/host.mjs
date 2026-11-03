/**
 * 宿主侧的取证：不起 DSH，只把 apply() 真的跑一遍。
 *
 * 验的都是「重启后才会知道坏了」的那类：
 *   1. index-inject 收到的行是不是 style + script（顺序也对），
 *   2. 第一帧脚本在 off 模式下会不会自己退出，
 *   3. 五条路由都能用真实请求形状跑通（含上传落盘）。
 *
 * 用法：node test/host.mjs
 */

import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { apply, firstFrame } from '../lib/index.js'

/** 上传测试会真的写文件，所以把 DSH_HOME 指到一个临时目录，别碰本机配置。 */
const sandbox = mkdtempSync(join(tmpdir(), 'star-boot-test-'))
const realHome = process.env.DSH_HOME
process.env.DSH_HOME = sandbox

const failures = []
const check = (label, condition, detail) => {
  if (condition) {
    console.log(`  ok   ${label}`)
    return
  }
  failures.push(label)
  console.log(`  FAIL ${label}${detail === undefined ? '' : ` — ${detail}`}`)
}

/* ---------- 1. 注入行 ---------- */

const rows = []
const routes = []
const ctx = {
  on(event, handler) {
    if (event === 'webserver/index-inject') handler(rows)
  },
  inject(dependencies, body) {
    body({
      effect(fn) {
        return fn()
      },
      webServer: {
        register(route) {
          routes.push(route)
          return () => {}
        },
      },
    })
  },
}

apply(ctx)

console.log('index-inject')
check('给了 style 行', rows.some((row) => row.kind === 'style'))
check('给了 script 行', rows.some((row) => row.kind === 'script'))
check('脚本在 head 里', rows.some((row) => row.kind === 'script' && row.placement === 'head'))
const scriptRow = rows.find((row) => row.kind === 'script')
check('脚本引用了握手名', scriptRow.text.includes('__dshStarFirstFrame'))
check('脚本认 off 模式', scriptRow.text.includes("mode===\"off\""))
check('style 用了 star-first', rows.find((row) => row.kind === 'style').text.includes('html.star-first'))
check('和 550C 的遮盖不打架', rows.find((row) => row.kind === 'style').text.includes('.dsh550c-host'))
check('第一帧导出与注入一致', firstFrame.css === rows.find((row) => row.kind === 'style').text)

/* ---------- 2. 路由 ---------- */

console.log('routes')
check('注册了 5 条', routes.length === 5, String(routes.length))
check('都是 exact', routes.every((route) => route.kind === 'exact'))
const byPath = Object.fromEntries(routes.map((route) => [route.path, route]))

function fakeRequest(method, url) {
  return { method, url, headers: {}, async *[Symbol.asyncIterator]() {} }
}

function fakeResponse() {
  const box = { status: 0, headers: null, body: null }
  return {
    box,
    writeHead(status, headers) {
      box.status = status
      box.headers = headers
    },
    end(body) {
      box.body = body
    },
  }
}

const cardRes = fakeResponse()
await byPath['/dsh-star-boot/card'].handler(fakeRequest('GET', '/dsh-star-boot/card'), cardRes)
const card = JSON.parse(cardRes.box.body)
console.log(`  card: ok=${String(card.ok)}${card.ok ? ` role=${String(card.role)} 记忆=${String(card.memories.total)} 心情=${String(card.mood?.emotion)}` : ` error=${String(card.error)}`}`)
check('card 返回 200', cardRes.box.status === 200)
check('card 是 JSON', String(cardRes.box.headers['content-type']).includes('application/json'))

const assetRes = fakeResponse()
byPath['/dsh-star-boot/asset'].handler(fakeRequest('GET', '/dsh-star-boot/asset'), assetRes)
check('asset 返回 200', assetRes.box.status === 200, String(assetRes.box.status))
check(
  'asset 是随包素材（webp 或 mp4）',
  assetRes.box.headers['content-type'] === 'image/webp' || assetRes.box.headers['content-type'] === 'video/mp4',
  String(assetRes.box.headers['content-type']),
)
check('asset 有 ETag', typeof assetRes.box.headers.etag === 'string')
check('asset 字节数 > 100k', assetRes.box.body.length > 100000, String(assetRes.box.body?.length))

const assetCached = fakeResponse()
const cachedRequest = fakeRequest('GET', '/dsh-star-boot/asset')
cachedRequest.headers['if-none-match'] = assetRes.box.headers.etag
byPath['/dsh-star-boot/asset'].handler(cachedRequest, assetCached)
check('二次取素材是 304', assetCached.box.status === 304, String(assetCached.box.status))

const audioRes = fakeResponse()
byPath['/dsh-star-boot/asset'].handler(fakeRequest('GET', '/dsh-star-boot/asset?slot=audio'), audioRes)
check('没配音效时 audio 槽 404', audioRes.box.status === 404, String(audioRes.box.status))

// 换素材之后最容易被缓存坑：同一个 URL 必须允许协商，不许长缓存。
check('素材不许长缓存', String(assetRes.box.headers['cache-control']) === 'no-cache', String(assetRes.box.headers['cache-control']))
check('素材声明支持 Range', String(assetRes.box.headers['accept-ranges']) === 'bytes')

const rangeRes = fakeResponse()
const rangeReq = fakeRequest('GET', '/dsh-star-boot/asset')
rangeReq.headers.range = 'bytes=100-199'
byPath['/dsh-star-boot/asset'].handler(rangeReq, rangeRes)
check('Range 返回 206', rangeRes.box.status === 206, String(rangeRes.box.status))
check(
  'Content-Range 正确',
  String(rangeRes.box.headers['content-range']).startsWith('bytes 100-199/'),
  String(rangeRes.box.headers['content-range']),
)
check('分片长度 100', rangeRes.box.body.length === 100, String(rangeRes.box.body === undefined ? undefined : rangeRes.box.body.length))

const tailRes = fakeResponse()
const tailReq = fakeRequest('GET', '/dsh-star-boot/asset')
tailReq.headers.range = 'bytes=-64'
byPath['/dsh-star-boot/asset'].handler(tailReq, tailRes)
check('尾段 Range 也能取', tailRes.box.status === 206 && tailRes.box.body.length === 64, String(tailRes.box.status))

const overRes = fakeResponse()
const overReq = fakeRequest('GET', '/dsh-star-boot/asset')
overReq.headers.range = 'bytes=999999999-'
byPath['/dsh-star-boot/asset'].handler(overReq, overRes)
check('越界 Range 返回 416', overRes.box.status === 416, String(overRes.box.status))

const configRes = fakeResponse()
byPath['/dsh-star-boot/config'].handler(fakeRequest('GET', '/dsh-star-boot/config'), configRes)
const config = JSON.parse(configRes.box.body)
check('config 可用', config.ok === true)
check('config 说明回退', config.fallback === true)
check('config 给了两个槽位', Boolean(config.slots) && config.slots.bg !== undefined && config.slots.audio !== undefined)
check('背景槽标了随包兜底', config.slots !== undefined && config.slots.bg.packed === true)
check('音效槽默认为空', config.slots !== undefined && config.slots.audio.path === null)

const audioBadRes = fakeResponse()
await byPath['/dsh-star-boot/config'].handler(
  { method: 'POST', headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() {
    yield Buffer.from(JSON.stringify({ slot: 'audio', path: 'C:\\no-such-open.mp3' }))
  } },
  audioBadRes,
)
const audioBad = JSON.parse(audioBadRes.box.body)
check('音效槽拒绝不存在的文件', audioBadRes.box.status === 400, String(audioBadRes.box.status))
check('拒绝时点名是哪个槽', audioBad.slot === 'audio', String(audioBad.slot))

const badRes = fakeResponse()
await byPath['/dsh-star-boot/config'].handler(
  { method: 'POST', headers: { 'content-type': 'application/json' }, async *[Symbol.asyncIterator]() {
    yield Buffer.from(JSON.stringify({ asset: 'no-such-file.png' }))
  } },
  badRes,
)
check('相对/不存在的素材被拒', badRes.box.status === 400, String(badRes.box.status))

/* ---------- 3. 上传（页面「选择文件」走的那条） ---------- */

console.log('upload')
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
)
const uploader = byPath['/dsh-star-boot/upload']

const sendUpload = async (headers, body) => {
  const res = fakeResponse()
  await uploader.handler(
    {
      method: 'POST',
      url: '/dsh-star-boot/upload',
      headers,
      async *[Symbol.asyncIterator]() {
        yield body
      },
    },
    res,
  )
  return { status: res.box.status, payload: JSON.parse(res.box.body) }
}

const first = await sendUpload({ 'x-star-slot': 'bg', 'x-star-name': encodeURIComponent('测试 图.png') }, PNG_1PX)
check('上传返回 200', first.status === 200, String(first.status))
check('上传后背景槽可用', first.payload.slots !== undefined && first.payload.slots.bg.usable === true)
check('素材落在 DSH_HOME 下', String(first.payload.assets.bg).includes('star-boot-assets'), first.payload.assets.bg)
check('文件真的写下去了', existsSync(first.payload.assets.bg))
check('文件名里的中文留着', String(first.payload.assets.bg).includes('测试'), first.payload.assets.bg)

const written = JSON.parse(readFileSync(join(sandbox, 'star-boot.json'), 'utf8'))
check('配置写进了 star-boot.json', written.assets.bg === first.payload.assets.bg)

const second = await sendUpload({ 'x-star-slot': 'bg', 'x-star-name': encodeURIComponent('测试 图.png') }, PNG_1PX)
check('再传一次也 200', second.status === 200, String(second.status))
check('旧的那份被清掉了', !existsSync(first.payload.assets.bg))

const wrongType = await sendUpload({ 'x-star-slot': 'bg', 'x-star-name': 'evil.exe' }, PNG_1PX)
check('上传拒绝 .exe', wrongType.status === 400, String(wrongType.status))

const empty = await sendUpload({ 'x-star-slot': 'bg', 'x-star-name': 'empty.png' }, Buffer.alloc(0))
check('上传拒绝空文件', empty.status === 400, String(empty.status))

const audioUp = await sendUpload({ 'x-star-slot': 'audio', 'x-star-name': 'open.mp3' }, Buffer.from('ID3fake', 'utf8'))
check('音效槽也能上传', audioUp.status === 200, String(audioUp.status))
check('音效槽变为可用', audioUp.payload.slots.audio.usable === true)

process.env.DSH_HOME = realHome
rmSync(sandbox, { recursive: true, force: true })

const panelRes = fakeResponse()
byPath['/dsh-star-boot/panel'].handler(fakeRequest('GET', '/dsh-star-boot/panel'), panelRes)
check('panel 返回 200', panelRes.box.status === 200)
check('panel 是 HTML', String(panelRes.box.headers['content-type']).includes('text/html'))
check('panel 带四个开关', ['mode', 'scheme', 'pace', 'auth'].every((key) => String(panelRes.box.body).includes('dsh-star-boot:' + key)))
check(
  'panel 带外观项',
  [
    'sound',
    'font',
    'fit',
    'pos',
    'dim',
    'scrim',
    'panel',
    'blur',
    'accent',
    'titleScale',
    'markScale',
    'markOpacity',
    'markStyle',
    'volume',
    'hold',
  ].every((key) => String(panelRes.box.body).includes('dsh-star-boot:' + key)),
)
check('panel 带音效槽', String(panelRes.box.body).includes('audio-path'))

console.log(failures.length === 0 ? '\nall good' : `\n${String(failures.length)} failed`)
process.exitCode = failures.length === 0 ? 0 : 1
