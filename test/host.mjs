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
import { createServer } from 'node:http'
import { apply, firstFrame, isNewerVersion } from '../lib/index.js'

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
check('注册了 6 条', routes.length === 6, String(routes.length))
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

// 写法看不懂的 Range 不能回 416：一些播放器会就此判死，整份给它才有救。
const oddRes = fakeResponse()
const oddReq = fakeRequest('GET', '/dsh-star-boot/asset')
oddReq.headers.range = 'bytes=abc-def'
byPath['/dsh-star-boot/asset'].handler(oddReq, oddRes)
check('畸形 Range 退回整份 200', oddRes.box.status === 200, String(oddRes.box.status))

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

/* ---------- 4. 检查更新（不联网：把 fetch 换掉） ---------- */

console.log('update')
check('1.7.10 比 1.7.2 新', isNewerVersion('1.7.10', '1.7.2') === true)
check('1.8.0 比 1.7.9 新', isNewerVersion('1.8.0', '1.7.9') === true)
check('同版本不算新', isNewerVersion('1.7.2', '1.7.2') === false)
check('旧版本不算新', isNewerVersion('1.7.1', '1.7.2') === false)

const realFetch = globalThis.fetch
const stubRelease = (tag, withAsset = true) => {
  globalThis.fetch = async () => ({
    ok: true,
    json: async () => ({
      tag_name: tag,
      body: '测试用发布说明',
      published_at: '2026-11-03T00:00:00Z',
      assets: withAsset ? [{ name: 'dsh-star-boot.zip', size: 1024, browser_download_url: 'https://example.invalid/a.zip' }] : [],
    }),
  })
}
const updateRoute = byPath['/dsh-star-boot/update']

stubRelease('v9.9.9')
const checkRes = fakeResponse()
await updateRoute.handler(fakeRequest('GET', '/dsh-star-boot/update'), checkRes)
const checkBody = JSON.parse(checkRes.box.body)
check('检查更新返回 ok', checkBody.ok === true)
check('检查更新认出新版本', checkBody.newer === true && checkBody.latest === '9.9.9', JSON.stringify(checkBody.latest))
check('检查更新带回了说明', String(checkBody.notes).length > 0)

// 版本已经是最新时，POST 不应去下载
const currentTag = 'v' + String(JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version)
stubRelease(currentTag)
const latestRes = fakeResponse()
await updateRoute.handler(
  { method: 'POST', url: '/dsh-star-boot/update', headers: {}, async *[Symbol.asyncIterator]() {} },
  latestRes,
)
const latestBody = JSON.parse(latestRes.box.body)
check('已是最新时不下载', latestBody.alreadyLatest === true, JSON.stringify(latestBody))

// 新版但没有 zip 附件 → 拒绝
stubRelease('v9.9.9', false)
const noAssetRes = fakeResponse()
await updateRoute.handler(
  { method: 'POST', url: '/dsh-star-boot/update', headers: {}, async *[Symbol.asyncIterator]() {} },
  noAssetRes,
)
check('没有 zip 附件时拒绝更新', JSON.parse(noAssetRes.box.body).ok === false)

globalThis.fetch = realFetch

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

/* ---------- 5. 片头卡里的四盏灯（1.9 与灵犀的那条线） ---------- */

console.log('lights')

/** 起一个只回一段 JSON 的假桥接。端口交给系统挑，避免和真的 3100 撞。 */
function fakeBridge(payload) {
  const server = createServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify(payload))
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }))
  })
}

/** 重新求值一次模块（常量在求值时读 env），拿到一份干净的 apply + 路由表。 */
async function freshRoutes(tag) {
  const fresh = await import('../lib/index.js?lights=' + tag)
  const captured = []
  fresh.apply({
    on(event, handler) {
      if (event === 'webserver/index-inject') handler([])
    },
    inject(dependencies, body) {
      body({
        effect(fn) {
          return fn()
        },
        webServer: {
          register(route) {
            captured.push(route)
            return () => {}
          },
        },
      })
    },
  })
  return Object.fromEntries(captured.map((route) => [route.path, route]))
}

const cardUpstream = await fakeBridge({
  ok: true,
  role: '独立AI',
  memories: { total: 7, core: 1 },
  mood: { emotion: '好奇', intensity: 3 },
  closest: { name: '某人' },
})
const diagUpstream = await fakeBridge({ bridge: true, dsh: true, snowluma: true, onebot: false, qq: true, note: 'OneBot 没起来' })

process.env.STAR_BOOT_BRIDGE = 'http://127.0.0.1:' + String(cardUpstream.port) + '/api/boot/card'
process.env.STAR_BOOT_DIAG = 'http://127.0.0.1:' + String(diagUpstream.port) + '/diag'

const merged = await freshRoutes('ok')
const mergedRes = fakeResponse()
await merged['/dsh-star-boot/card'].handler(fakeRequest('GET', '/dsh-star-boot/card'), mergedRes)
const mergedCard = JSON.parse(mergedRes.box.body)
check('卡还是桥接那张', mergedCard.ok === true && mergedCard.role === '独立AI')
check('多带了一组灯', mergedCard.lights !== undefined && typeof mergedCard.lights === 'object', JSON.stringify(mergedCard))
check('四盏灯逐个是布尔', mergedCard.lights !== undefined && ['dsh', 'snowluma', 'onebot', 'qq'].every((key) => typeof mergedCard.lights[key] === 'boolean'))
check('灭的灯照样说实话', mergedCard.lights !== undefined && mergedCard.lights.onebot === false && mergedCard.lights.qq === true)
check('把桥接的说明也带上了', mergedCard.lights !== undefined && mergedCard.lights.note === 'OneBot 没起来')

// 灯读不到时必须**少一个字段**，而不是四个灰点（客户端据此不画链路那一格）。
process.env.STAR_BOOT_DIAG = 'http://127.0.0.1:1/diag'
const degraded = await freshRoutes('nodiag')
const degradedRes = fakeResponse()
await degraded['/dsh-star-boot/card'].handler(fakeRequest('GET', '/dsh-star-boot/card'), degradedRes)
const degradedCard = JSON.parse(degradedRes.box.body)
check('灯读不到时卡照旧', degradedCard.ok === true && degradedCard.role === '独立AI')
check('灯读不到时没有 lights 字段', degradedCard.lights === undefined, JSON.stringify(degradedCard))

/* ---------- 6. 灯慢的时候不许拖住卡（开机的 420ms 窗口） ---------- */

console.log('lights budget')

// 一个「回得特别慢」的 /diag：模拟 tasklist 卡住。卡必须照常按时出来。
const slowDiag = createServer((req, res) => {
  setTimeout(() => {
    res.writeHead(200, { 'content-type': 'application/json' })
    res.end(JSON.stringify({ dsh: true, snowluma: true, onebot: true, qq: true }))
  }, 3000)
})
await new Promise((resolve) => slowDiag.listen(0, '127.0.0.1', resolve))

process.env.STAR_BOOT_DIAG = 'http://127.0.0.1:' + String(slowDiag.address().port) + '/diag'
const slow = await freshRoutes('slowdiag')
const started = Date.now()
const slowRes = fakeResponse()
await slow['/dsh-star-boot/card'].handler(fakeRequest('GET', '/dsh-star-boot/card'), slowRes)
const elapsed = Date.now() - started
const slowCard = JSON.parse(slowRes.box.body)
check('慢灯下卡照样出来了', slowCard.ok === true && slowCard.role === '独立AI')
check('慢灯没有拖住卡（< 900ms）', elapsed < 900, elapsed + 'ms')
check('慢灯时先不画灯，而不是画假的', slowCard.lights === undefined, JSON.stringify(slowCard.lights))

slowDiag.close()

cardUpstream.server.close()
diagUpstream.server.close()

console.log(failures.length === 0 ? '\nall good' : `\n${String(failures.length)} failed`)
process.exitCode = failures.length === 0 ? 0 : 1
