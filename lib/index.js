/**
 * dsh-star-boot —— 宿主那一半（Node 侧）。
 *
 * 这一半只做三件小事，但第一件是整条动画能不能成立的前提：
 *
 *   1. 首帧遮盖。DSH 的启动卡（`[data-dsh-boot]`，"Loading plugins…"）由 shell
 *      在客户端插件被求值之前就画好了——作者在 550C 那边实测是 67ms 出现、
 *      338ms 插件才求值、517ms 卡才被销毁。所以任何「先在插件里画点什么」的
 *      做法都必然慢半拍。唯一比 shell 更早的surface 是**送达的文档本身**：
 *      `webserver/index-inject` 收一张 index 行表，Web 端把它们渲染进
 *      index.html 的 <head> 之后，早于 shell 内核建卡。于是这里塞一行 style
 *      和一行同步 script，卡根本不会出现。
 *
 *   2. 状态卡的数据。她此刻的记忆/心情/压力/最在意都在 qq-bridge（3100）里，
 *      而页面有自己的 CSP、跨域也麻烦——所以由宿主去取，页面只访问同源的
 *      `/dsh-star-boot/card`。取不到就返回 ok:false，动画退化成只有片头。
 *
 *   3. 素材：背景可以换成任意本机图片/视频，音效可以换成任意本机音频。
 *      两者都只走 `/dsh-star-boot/asset?slot=bg|audio` 这一条同源路径。
 *
 * 与客户端（lib/client.js）的契约：
 *
 *   MODE_KEY           同一个 localStorage 键、同一个默认值；脚本在 'off' 时
 *                      直接不遮盖，重启后就是原样的 DSH。
 *   FIRST_FRAME_GLOBAL `window.__dshStarFirstFrame.end()` 是唯一撤遮盖的入口，
 *                      客户端在自己上屏的同一个 task 里调用它——一次绘制，没有缝。
 *                      下面的 boot watch 和超时是兜底：客户端挂了也不能留个黑窗。
 *
 * @module dsh-star-boot
 */

import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, renameSync, rmSync, statSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir, tmpdir } from 'node:os'
import { execFileSync } from 'node:child_process'

export const name = 'star-boot'

/** src/client.js MODE_KEY / DEFAULT_MODE —— 必须保持一致。 */
const MODE_KEY = 'dsh-star-boot:mode'
const DEFAULT_MODE = 'card'

/** src/client.js FIRST_FRAME_GLOBAL —— 必须保持一致。 */
const FIRST_FRAME_GLOBAL = '__dshStarFirstFrame'
/** src/client.js VERSION_GLOBAL —— 设置行读版本用。 */
const VERSION_GLOBAL = '__dshStarVersion'

/** 和客户端 :host 背景同一个颜色，交接时看不出接缝。 */
const FIRST_FRAME_BG = '#04070f'
/** 遮盖自己的 z-index；要比 550C 的那条（2147482000）高一层。 */
const FIRST_FRAME_Z = 2147482001
/** 上限（ms）：过了就把页面还回去，不赌客户端会不会挂。 */
const FIRST_FRAME_MAX_MS = 12000

const CARD_ROUTE = '/dsh-star-boot/card'
const ASSET_ROUTE = '/dsh-star-boot/asset'
const CONFIG_ROUTE = '/dsh-star-boot/config'
/** 页面选中的文件从这里进来：浏览器给不了绝对路径，只给得了字节。 */
const UPLOAD_ROUTE = '/dsh-star-boot/upload'
/** 设置界面被禁用时（本机 profile 就是），这个同源小面板是唯一的开关。 */
const PANEL_ROUTE = '/dsh-star-boot/panel'
/** 检查 / 一键更新：去 GitHub 问最新 release，然后下载替换文件。 */
const UPDATE_ROUTE = '/dsh-star-boot/update'
const UPDATE_REPO = process.env.STAR_BOOT_UPDATE_REPO ?? '2524034412-boop/DSH'
const UPDATE_TTL_MS = 10 * 60 * 1000
const UPDATE_TIMEOUT_MS = 8000
const UPDATE_DOWNLOAD_TIMEOUT_MS = 180000
const MAX_UPDATE_BYTES = 64 * 1024 * 1024

/** 桥接那边提供一张现成的状态卡；拿不到就是没有，不编。 */
const BRIDGE_CARD = process.env.STAR_BOOT_BRIDGE ?? 'http://127.0.0.1:3100/api/boot/card'
/**
 * 同一台桥接上的「四盏灯」：DSH / SnowLuma / OneBot / QQ。
 *
 * 为什么不从灵犀插件那边取：这张卡是**开机片头**要的，片头比设置页早得多，
 * 不能依赖另一个 DSH 插件已经起来了。3100 才是数据的源头，直接问它。
 * 这条读不到不代表出错——只是这版片头少一行灯。
 */
const BRIDGE_DIAG = process.env.STAR_BOOT_DIAG ?? 'http://127.0.0.1:3100/diag'
const CARD_TIMEOUT_MS = 1200
const CARD_TTL_MS = 20 * 1000

/** 背景（图片/视频）与音效各自的上限：都是开机时一次性读进内存的东西。 */
const MAX_MEDIA_BYTES = 64 * 1024 * 1024
const MAX_AUDIO_BYTES = 24 * 1024 * 1024

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const PACKAGED_ASSET = resolve(REPO_ROOT, 'assets', 'hero.webp')
/**
 * 随包视频。发布版里带了一条 default-bg.mp4，所以新装的人开机看到的就是那段片子；
 * 没有这个文件（源码副本、或者作者删了）就退回 hero.webp，不会白屏。
 */
const PACKAGED_VIDEO = resolve(REPO_ROOT, 'assets', 'default-bg.mp4')

/** 背景能是图片，也能是视频。 */
const MEDIA_MIME = {
  '.webp': 'image/webp',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
  '.m4v': 'video/mp4',
}

/** 音效只收浏览器都认的那几种。 */
const AUDIO_MIME = {
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac',
}

const SLOTS = {
  bg: { kind: 'media', label: '背景', max: MAX_MEDIA_BYTES },
  audio: { kind: 'audio', label: '音效', max: MAX_AUDIO_BYTES },
}

function packageVersion() {
  try {
    return JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version ?? null
  } catch (error) {
    return null
  }
}

const VERSION = packageVersion()

/**
 * 设置文件：`$DSH_HOME/star-boot.json`。
 *
 * 只存「哪个槽位用哪个文件」这种宿主侧才知道的东西；模式、配色、文案这些
 * 留在 localStorage —— 那一半是页面的事，宿主不该替它记。
 *
 * ```json
 * { "version": 2, "assets": { "bg": "C:\\art\\a.mp4", "audio": "C:\\art\\open.mp3" } }
 * ```
 */
function configPath() {
  const home = process.env.DSH_HOME ?? resolve(homedir(), '.dsh')
  return resolve(home, 'star-boot.json')
}

function cleanPath(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

function readConfig() {
  let raw = {}
  try {
    const parsed = JSON.parse(readFileSync(configPath(), 'utf8'))
    if (parsed !== null && typeof parsed === 'object') raw = parsed
  } catch (error) {
    raw = {}
  }
  // 兼容 1.3 的单素材格式 { asset }：当成背景槽。
  const bag = raw.assets !== null && typeof raw.assets === 'object' ? raw.assets : {}
  return {
    assets: {
      bg: cleanPath(bag.bg) ?? cleanPath(raw.asset),
      audio: cleanPath(bag.audio),
    },
  }
}

function writeConfig(config) {
  const file = configPath()
  const payload = { version: 2, assets: { bg: config.assets.bg, audio: config.assets.audio } }
  try {
    writeFileSync(file, `${JSON.stringify(payload, null, 2)}\n`, 'utf8')
    return true
  } catch (error) {
    console.error('[dsh-star-boot] 写设置失败', error)
    return false
  }
}

/** 这个文件能不能当这个槽位用：存在、是文件、够小、扩展名认识。 */
function assetState(candidate, slot = 'bg') {
  if (candidate === null || candidate === undefined) return { ok: false, reason: 'no-path' }
  const spec = SLOTS[slot] ?? SLOTS.bg
  const table = spec.kind === 'audio' ? AUDIO_MIME : MEDIA_MIME
  const file = resolve(String(candidate))
  if (!existsSync(file)) return { ok: false, reason: 'missing' }
  let stat
  try {
    stat = statSync(file)
  } catch (error) {
    return { ok: false, reason: 'stat-failed' }
  }
  if (!stat.isFile()) return { ok: false, reason: 'not-a-file' }
  if (stat.size > spec.max) return { ok: false, reason: 'too-large', bytes: stat.size }
  const mime = table[extname(file).toLowerCase()]
  if (mime === undefined) return { ok: false, reason: 'unsupported-type' }
  return { ok: true, file, mime, bytes: stat.size, mtime: stat.mtimeMs }
}

/**
 * 槽位最终会被服务成什么。
 *
 * 背景有随包兜底（优先随包视频，其次 hero.webp），音效没有——音效没配就是没有声音，
 * 不该拿一个默认音频骗人。
 */
function packagedBackground() {
  const video = assetState(PACKAGED_VIDEO, 'bg')
  if (video.ok) return video
  return assetState(PACKAGED_ASSET, 'bg')
}

function effectiveAsset(slot, config) {
  const chosen = assetState(config.assets[slot], slot)
  if (slot !== 'bg') return chosen
  if (chosen.ok) return chosen
  return packagedBackground()
}

function slotReport(slot, config) {
  const chosen = assetState(config.assets[slot], slot)
  const effective = effectiveAsset(slot, config)
  return {
    path: config.assets[slot],
    usable: chosen.ok,
    effective: effective.ok ? effective.file : null,
    packed: slot === 'bg' && effective.ok && !chosen.ok,
    reason: config.assets[slot] === null ? null : chosen.ok ? null : chosen.reason,
    bytes: chosen.ok ? chosen.bytes : null,
    mime: effective.ok ? effective.mime : null,
  }
}

/** GET /config、POST /config、POST /upload 三条路回的是同一个形状。 */
function snapshot(config) {
  const bg = slotReport('bg', config)
  const audio = slotReport('audio', config)
  return {
    ok: true,
    version: VERSION,
    assets: config.assets,
    slots: { bg, audio },
    // ---- 1.3 的旧字段，留着不让老调用方读炸 ----
    asset: config.assets.bg,
    effective: bg.effective,
    fallback: packagedBackground().ok,
    reason: bg.reason,
    packaged: packagedBackground().ok ? packagedBackground().file : PACKAGED_ASSET,
  }
}

function sendJson(res, status, payload, head = false) {
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
  })
  // HEAD 只回头，带 body 是协议违规（Node 会替你丢掉，但别指望它）。
  res.end(head ? undefined : JSON.stringify(payload))
}

async function readBody(req) {
  const chunks = []
  let total = 0
  for await (const chunk of req) {
    total += chunk.length
    if (total > 1024 * 1024) throw new Error('body too large')
    chunks.push(chunk)
  }
  return Buffer.concat(chunks).toString('utf8')
}

/** 状态卡的上游缓存：开机时可能连着来两次请求（预览 + 真开机），不必都打桥接。 */
let cachedCard = null
let cachedAt = 0

/** 四盏灯。只认 true/false，缺字段当作不知道（null），别替它猜「亮」。 */
async function readLights() {
  try {
    const answer = await fetch(BRIDGE_DIAG, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CARD_TIMEOUT_MS),
    })
    if (!answer.ok) return null
    const payload = await answer.json()
    if (payload === null || typeof payload !== 'object') return null
    return {
      dsh: payload.dsh === true,
      snowluma: payload.snowluma === true,
      onebot: payload.onebot === true,
      qq: payload.qq === true,
      note: typeof payload.note === 'string' ? payload.note : '',
    }
  } catch (error) {
    // 桥接没开、超时、回了个不是 JSON 的东西：都只是「这版没有灯」。
    return null
  }
}

/**
 * 灯要在开机的 420 毫秒窗口里赶到，赶不到就先不显示——**不能为了四盏灯让整张卡迟到**。
 * 所以这里给灯单独一个更短的预算，并且迟到的答案照样收进缓存，下次开机就有了。
 */
const LIGHTS_BUDGET_MS = 260
let cachedLights = null
let cachedLightsAt = 0

function rememberLights(lights) {
  if (lights === null) return
  cachedLights = lights
  cachedLightsAt = Date.now()
}

/** 预算内拿得到就返回，拿不到返回 null，同时留一个后台更新（下次就有了）。 */
async function lightsWithinBudget() {
  if (cachedLights !== null && Date.now() - cachedLightsAt < CARD_TTL_MS) return cachedLights
  const pending = readLights()
  void pending.then(rememberLights).catch(() => {})
  const budget = new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), LIGHTS_BUDGET_MS)
    if (typeof timer.unref === 'function') timer.unref()
  })
  return await Promise.race([pending, budget])
}

async function loadCard() {
  if (cachedCard !== null && Date.now() - cachedAt < CARD_TTL_MS) return cachedCard
  try {
    // 卡和灯并行问。灯用更短的预算（见上），卡本身仍是 1.2 秒上限。
    const cardPromise = fetch(BRIDGE_CARD, {
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(CARD_TIMEOUT_MS),
    })
    const lightsPromise = lightsWithinBudget()
    const answer = await cardPromise
    if (!answer.ok) throw new Error(`HTTP ${String(answer.status)}`)
    const payload = await answer.json()
    const lights = await lightsPromise
    const merged = lights === null ? payload : { ...payload, lights }
    cachedCard = merged
    cachedAt = Date.now()
    return merged
  } catch (error) {
    // 桥接没开、还没起来、或者这台机器根本没装桥接——都不是错误，只说明没有卡。
    const message = error instanceof Error ? error.message : String(error)
    return { ok: false, error: message }
  }
}

/**
 * GET /dsh-star-boot/card -> { ok, role, mood, stress, memories, closest, lights?, ... }
 *
 * `lights` 是 1.9 新加的：{ dsh, snowluma, onebot, qq, note }，来自桥接的 /diag。
 * 读不到就没有这个字段——客户端据此少画一行，而不是画四个灰点。
 *
 * 同源、无 CORS、无 CSP 问题：页面只跟宿主说话，宿主替它去问桥接。
 * 拿不到时返回 200 + ok:false，客户端据此缩短动画而不是报错。
 */
async function cardHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  sendJson(res, 200, await loadCard(), req.method === 'HEAD')
}

function slotOf(req) {
  try {
    const value = new URL(String(req.url ?? ''), 'http://star-boot.local').searchParams.get('slot')
    return value === 'audio' ? 'audio' : 'bg'
  } catch (error) {
    return 'bg'
  }
}

/**
 * GET /dsh-star-boot/asset?slot=bg|audio -> 素材本身。
 *
 * 带 ETag、**不带长缓存**：所有素材共用同一个 URL，如果允许浏览器缓存一小时，
 * 换完素材再预览还会拿到旧图（第一次踩的就是这个）。所以只允许协商缓存：
 * 内容没变回 304，变了立刻是新文件。
 *
 * 支持 Range：mp4 的 moov 常贴在文件末尾，播放器要跳到尾部才能起播。
 */
function assetHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  const slot = slotOf(req)
  const state = effectiveAsset(slot, readConfig())
  if (!state.ok) {
    res.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('no asset')
    return
  }
  const etag = `"${slot}-s${String(Math.round(state.mtime))}-${String(state.bytes)}"`
  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, { etag, 'cache-control': 'no-cache' })
    res.end()
    return
  }
  let body
  try {
    body = readFileSync(state.file)
  } catch (error) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' })
    res.end('read failed')
    return
  }

  const total = body.length
  const range = req.headers.range
  // 只有语法正确的 Range 才当成续传；写法不认识就当没有，整份给它（RFC 9110 允许）——
  // 回 416 会让一些播放器直接判死，而它们本可以整份读下来。
  const match = typeof range === 'string' ? /^bytes=(\d*)-(\d*)$/.exec(range.trim()) : null
  if (match !== null && (match[1] !== '' || match[2] !== '')) {
    let start = match[1] !== '' ? Number(match[1]) : null
    let end = match[2] !== '' ? Number(match[2]) : null
    if (start === null && end !== null) {
      // "bytes=-N"：最后 N 个字节
      start = Math.max(0, total - end)
      end = total - 1
    } else if (start !== null && end === null) {
      end = total - 1
    }
    if (start !== null && end !== null && start <= end && start < total) {
      end = Math.min(end, total - 1)
      const slice = body.subarray(start, end + 1)
      res.writeHead(206, {
        'content-type': state.mime,
        'content-length': String(slice.length),
        'content-range': `bytes ${String(start)}-${String(end)}/${String(total)}`,
        'accept-ranges': 'bytes',
        'cache-control': 'no-cache',
        etag,
      })
      res.end(req.method === 'HEAD' ? undefined : slice)
      return
    }
    res.writeHead(416, { 'content-range': `bytes */${String(total)}`, 'accept-ranges': 'bytes' })
    res.end()
    return
  }

  res.writeHead(200, {
    'content-type': state.mime,
    'content-length': String(total),
    'cache-control': 'no-cache',
    etag,
    'accept-ranges': 'bytes',
  })
  res.end(req.method === 'HEAD' ? undefined : body)
}

/** 只接受绝对路径：相对路径在宿主进程里的工作目录不是用户想的地方。 */
function isAbsolutePath(value) {
  return /^[a-zA-Z]:[\\/]/.test(value) || value.startsWith('\\\\')
}

/**
 * GET  /dsh-star-boot/config -> { ok, assets, slots, fallback, ... }
 * POST /dsh-star-boot/config { slot, path } -> 换某个槽位（传空串恢复默认）
 * POST { assets: { bg, audio } } 也收，方便一次写两个。
 */
async function configHandler(req, res) {
  if (req.method === 'GET' || req.method === 'HEAD') {
    sendJson(res, 200, snapshot(readConfig()), req.method === 'HEAD')
    return
  }
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'GET, POST' })
    res.end()
    return
  }
  let body = {}
  try {
    body = JSON.parse((await readBody(req)) || '{}')
  } catch (error) {
    sendJson(res, 400, { ok: false, error: 'body 不是 JSON' })
    return
  }

  // 新版：{ slot, path }；旧版：{ asset }（背景）；整包：{ assets: { bg, audio } }
  const patch = {}
  if (typeof body.assets === 'object' && body.assets !== null) {
    if ('bg' in body.assets) patch.bg = body.assets.bg
    if ('audio' in body.assets) patch.audio = body.assets.audio
  }
  if (typeof body.slot === 'string' && (body.slot === 'bg' || body.slot === 'audio')) {
    patch[body.slot] = body.path
  } else if ('asset' in body) {
    patch.bg = body.asset
  }
  if (Object.keys(patch).length === 0) {
    sendJson(res, 400, { ok: false, error: '没有要改的槽位' })
    return
  }

  const config = readConfig()
  for (const slot of ['bg', 'audio']) {
    if (!(slot in patch)) continue
    const raw = typeof patch[slot] === 'string' ? patch[slot].trim() : ''
    if (raw === '') {
      config.assets[slot] = null
      continue
    }
    if (!isAbsolutePath(raw)) {
      sendJson(res, 400, { ok: false, error: '要本机绝对路径', reason: 'not-absolute', slot })
      return
    }
    const state = assetState(raw, slot)
    if (!state.ok) {
      sendJson(res, 400, {
        ok: false,
        error: `${SLOTS[slot].label}不可用：${String(state.reason)}`,
        reason: state.reason,
        slot,
      })
      return
    }
    config.assets[slot] = state.file
  }

  if (!writeConfig(config)) {
    sendJson(res, 500, { ok: false, error: '写设置失败' })
    return
  }
  sendJson(res, 200, snapshot(config))
}

/* ============================================================
 * 上传：页面点「选择文件」走这里
 *
 * 浏览器里 <input type=file> 只给得出 File 对象，拿不到绝对路径；
 * Electron 的 webUtils.getPathForFile 又要 preload 暴露才拿得到。
 * 所以干脆收字节：宿主把文件写进 $DSH_HOME/star-boot-assets，
 * 再把「这个槽位现在指向哪个本机路径」写进配置——后面全走老路。
 * ========================================================== */

function assetsDir() {
  const home = process.env.DSH_HOME ?? resolve(homedir(), '.dsh')
  return resolve(home, 'star-boot-assets')
}

function headerText(value) {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== 'string') return ''
  try {
    return decodeURIComponent(raw)
  } catch (error) {
    return raw
  }
}

async function uploadHandler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end()
    return
  }
  const slot = String(req.headers['x-star-slot'] ?? '') === 'audio' ? 'audio' : 'bg'
  const spec = SLOTS[slot]
  const name = headerText(req.headers['x-star-name']) || 'file'
  const ext = extname(name).toLowerCase()
  const mime = (spec.kind === 'audio' ? AUDIO_MIME : MEDIA_MIME)[ext]
  if (mime === undefined) {
    sendJson(res, 400, {
      ok: false,
      error: `${spec.label}不支持 ${ext === '' ? '没有扩展名的文件' : ext}（图片 webp/png/jpg/avif/gif，视频 mp4/webm/m4v，音频 mp3/wav/ogg/m4a/aac/flac）`,
      reason: 'unsupported-type',
      slot,
    })
    return
  }

  const chunks = []
  let total = 0
  try {
    for await (const chunk of req) {
      total += chunk.length
      if (total > spec.max) {
        sendJson(res, 413, {
          ok: false,
          error: `${spec.label}超过 ${String(Math.round(spec.max / 1024 / 1024))}MB`,
          reason: 'too-large',
          slot,
        })
        return
      }
      chunks.push(chunk)
    }
  } catch (error) {
    sendJson(res, 400, { ok: false, error: '读取上传内容失败', slot })
    return
  }
  const body = Buffer.concat(chunks)
  if (body.length === 0) {
    sendJson(res, 400, { ok: false, error: '空文件', slot })
    return
  }

  const dir = assetsDir()
  try {
    mkdirSync(dir, { recursive: true })
  } catch (error) {
    sendJson(res, 500, { ok: false, error: '建素材目录失败', slot })
    return
  }
  // 只留安全字符：文件名里可能有空格、括号、中文；路径分隔符一律换掉。
  const safe = name.replace(/[^\w.\-\u4e00-\u9fa5]+/g, '_').slice(-60)
  const file = join(dir, `${Date.now().toString(36)}-${safe}`)
  try {
    writeFileSync(file, body)
  } catch (error) {
    console.error('[dsh-star-boot] 写入上传失败', error)
    sendJson(res, 500, { ok: false, error: '写入失败', slot })
    return
  }

  const config = readConfig()
  const previous = config.assets[slot]
  config.assets[slot] = file
  if (!writeConfig(config)) {
    sendJson(res, 500, { ok: false, error: '写设置失败', slot })
    return
  }
  // 被换掉的那份如果是我们拷进来的，顺手删掉，别让目录越堆越大。
  if (previous !== null && previous !== file) {
    try {
      if (resolve(dirname(previous)) === dir && existsSync(previous)) unlinkSync(previous)
    } catch (error) {
      /* 删不掉就算了，不影响这次使用 */
    }
  }
  sendJson(res, 200, snapshot(config))
}

/* ============================================================
 * 检查更新 / 一键更新
 *
 * 只信自己仓库的 release：先问 GitHub「最新一版是谁」，比版本号；
 * 真要更新时才下载 zip、解压、校验 package.json 的 name 和 version，
 * 然后把旧目录改名备份，新文件放进去。任何一步失败都回滚。
 * ========================================================== */

/** "1.7.10" > "1.7.9"——按数字比，不按字符串比。 */
function parseVersion(value) {
  const parts = String(value ?? '')
    .replace(/^v/i, '')
    .split(/[.\-+]/)
  const nums = []
  for (let i = 0; i < 3; i += 1) {
    const n = Number(parts[i])
    nums.push(Number.isFinite(n) ? n : 0)
  }
  return nums
}

function isNewerVersion(latest, current) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < 3; i += 1) {
    if (a[i] > b[i]) return true
    if (a[i] < b[i]) return false
  }
  return false
}

let cachedRelease = null
let cachedReleaseAt = 0

async function fetchLatestRelease(force = false) {
  if (!force && cachedRelease !== null && Date.now() - cachedReleaseAt < UPDATE_TTL_MS) return cachedRelease
  const answer = await fetch(`https://api.github.com/repos/${UPDATE_REPO}/releases/latest`, {
    headers: { accept: 'application/vnd.github+json', 'user-agent': 'dsh-star-boot-updater' },
    signal: AbortSignal.timeout(UPDATE_TIMEOUT_MS),
  })
  if (!answer.ok) throw new Error(`GitHub 返回 HTTP ${String(answer.status)}`)
  const release = await answer.json()
  const asset = Array.isArray(release.assets)
    ? release.assets.find((item) => typeof item.name === 'string' && /\.zip$/i.test(item.name))
    : undefined
  cachedRelease = {
    latest: String(release.tag_name ?? release.name ?? '').replace(/^v/i, ''),
    notes: typeof release.body === 'string' ? release.body : '',
    publishedAt: release.published_at ?? null,
    assetUrl: asset ? asset.browser_download_url : null,
    assetName: asset ? asset.name : null,
    assetSize: asset ? asset.size : 0,
  }
  cachedReleaseAt = Date.now()
  return cachedRelease
}

async function updateCheckHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  try {
    const info = await fetchLatestRelease()
    sendJson(
      res,
      200,
      {
        ok: true,
        current: VERSION,
        latest: info.latest,
        newer: isNewerVersion(info.latest, VERSION),
        notes: info.notes,
        publishedAt: info.publishedAt,
        assetName: info.assetName,
        assetSize: info.assetSize,
      },
      req.method === 'HEAD',
    )
  } catch (error) {
    // 检查更新失败不是错误页：把原因原样告诉界面，让它显示「检查失败：…」。
    sendJson(res, 200, { ok: false, current: VERSION, error: error instanceof Error ? error.message : String(error) })
  }
}

/** 解压：优先系统自带的 bsdtar（Win10 1803+），退回 PowerShell 的 Expand-Archive。 */
function extractZip(zipFile, into) {
  try {
    execFileSync('tar', ['-xf', zipFile, '-C', into], { timeout: 120000, windowsHide: true })
    return
  } catch (error) {
    /* 没有 tar 的 Windows 才走下面 */
  }
  execFileSync(
    'powershell',
    [
      '-NoProfile',
      '-NonInteractive',
      '-Command',
      `Expand-Archive -LiteralPath '${zipFile.replace(/'/g, "''")}' -DestinationPath '${into.replace(/'/g, "''")}' -Force`,
    ],
    { timeout: 180000, windowsHide: true },
  )
}

/** 解压出来的第一层如果是单个目录（打包时套了一层），就往下走一层。 */
function findPackageRoot(dir) {
  if (existsSync(join(dir, 'package.json'))) return dir
  let entries = []
  try {
    entries = readdirSync(dir)
  } catch (error) {
    return null
  }
  for (const name of entries) {
    const candidate = join(dir, name)
    try {
      if (statSync(candidate).isDirectory() && existsSync(join(candidate, 'package.json'))) return candidate
    } catch (error) {
      /* 跳过怪文件 */
    }
  }
  return null
}

async function updateApplyHandler(req, res) {
  if (req.method !== 'POST') {
    res.writeHead(405, { allow: 'POST' })
    res.end()
    return
  }
  let info
  try {
    info = await fetchLatestRelease(true)
  } catch (error) {
    sendJson(res, 200, { ok: false, error: '检查新版本失败：' + (error instanceof Error ? error.message : String(error)) })
    return
  }
  if (!isNewerVersion(info.latest, VERSION)) {
    sendJson(res, 200, { ok: true, alreadyLatest: true, current: VERSION, latest: info.latest })
    return
  }
  if (typeof info.assetUrl !== 'string' || info.assetUrl === '') {
    sendJson(res, 200, { ok: false, error: '最新版本没有上传 zip 附件' })
    return
  }
  if (info.assetSize > MAX_UPDATE_BYTES) {
    sendJson(res, 200, { ok: false, error: `安装包太大（${String(info.assetSize)} 字节）` })
    return
  }

  const stamp = String(Date.now())
  const zipFile = join(tmpdir(), `dsh-star-boot-${stamp}.zip`)
  const workDir = mkdtempSync(join(tmpdir(), 'dsh-star-boot-upd-'))
  try {
    const download = await fetch(info.assetUrl, {
      headers: { 'user-agent': 'dsh-star-boot-updater' },
      signal: AbortSignal.timeout(UPDATE_DOWNLOAD_TIMEOUT_MS),
    })
    if (!download.ok) throw new Error(`下载安装包失败：HTTP ${String(download.status)}`)
    const buffer = Buffer.from(await download.arrayBuffer())
    if (buffer.length > MAX_UPDATE_BYTES) throw new Error('安装包超出大小上限')
    writeFileSync(zipFile, buffer)

    extractZip(zipFile, workDir)
    const root = findPackageRoot(workDir)
    if (root === null) throw new Error('安装包里找不到 package.json')

    let manifest
    try {
      manifest = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8').replace(/^\uFEFF/, ''))
    } catch (error) {
      throw new Error('安装包的 package.json 读不了')
    }
    if (manifest.name !== 'dsh-star-boot') throw new Error('安装包不是 dsh-star-boot，已拒绝')
    if (String(manifest.version) !== info.latest) {
      throw new Error(`安装包版本 ${String(manifest.version)} 与发布版本 ${info.latest} 不一致`)
    }
    if (!existsSync(join(root, 'cordis.patch.yml'))) throw new Error('安装包缺少 cordis.patch.yml')

    // 备份 → 换文件 → 失败回滚
    const backup = `${REPO_ROOT}.bak-${VERSION}`
    try {
      if (existsSync(backup)) rmSync(backup, { recursive: true, force: true })
      renameSync(REPO_ROOT, backup)
    } catch (error) {
      throw new Error('旧版本目录改名失败（DSH 可能还开着，或文件被杀毒软件占用）')
    }
    try {
      mkdirSync(REPO_ROOT, { recursive: true })
      cpSync(root, REPO_ROOT, { recursive: true, force: true })
    } catch (error) {
      try {
        rmSync(REPO_ROOT, { recursive: true, force: true })
        renameSync(backup, REPO_ROOT)
      } catch (inner) {
        /* 回滚也失败：下面把备份路径告诉用户 */
      }
      throw new Error('写入新版本失败，已回滚：' + (error instanceof Error ? error.message : String(error)))
    }
    cachedRelease = null
    sendJson(res, 200, { ok: true, from: VERSION, to: info.latest, backup, restartRequired: true })
  } catch (error) {
    sendJson(res, 200, { ok: false, error: error instanceof Error ? error.message : String(error) })
  } finally {
    try {
      rmSync(zipFile, { force: true })
      rmSync(workDir, { recursive: true, force: true })
    } catch (error) {
      /* 临时文件删不掉不影响结果 */
    }
  }
}

/* ============================================================
 * 同源控制页
 *
 * 设置界面被禁用时（本机 profile 曾经就是），这个页面是唯一能改东西的地方。
 * 它和 DSH 同一来源，所以写进 localStorage 的键就是片头下次启动读到的键。
 * ========================================================== */

const PANEL_DEFAULTS = {
  'dsh-star-boot:mode': 'card',
  'dsh-star-boot:scheme': 'star',
  'dsh-star-boot:pace': 'normal',
  'dsh-star-boot:auth': 'on',
  'dsh-star-boot:mark': 'on',
  'dsh-star-boot:markStyle': 'glass',
  'dsh-star-boot:markOpacity': '60',
  'dsh-star-boot:overlay': 'on',
  'dsh-star-boot:sound': 'off',
  'dsh-star-boot:hold': 'on',
  'dsh-star-boot:font': 'system',
  'dsh-star-boot:fit': 'cover',
  'dsh-star-boot:pos': 'center',
  'dsh-star-boot:dim': '85',
  'dsh-star-boot:scrim': '60',
  'dsh-star-boot:panel': 'lb',
  'dsh-star-boot:blur': '0',
  'dsh-star-boot:accent': '',
  'dsh-star-boot:titleScale': '100',
  'dsh-star-boot:markScale': '100',
  'dsh-star-boot:volume': '60',
}

const PANEL_TEXT = {
  name: '小肥鱼',
  eyebrow: 'DEEPSEEK HARNESS · 星图',
  lineOk: '记忆 {mem} 条，星图已接上',
  lineNoCard: '星图未接上，先开机',
  mark: 'DeepSeek',
  hint: 'ESC 跳过',
  authHint: '点击 或 Enter 接入 · ESC 跳过',
}

const PANEL_POSITIONS = [
  ['center', '居中'],
  ['top', '上'],
  ['bottom', '下'],
  ['left', '左'],
  ['right', '右'],
  ['left top', '左上'],
  ['right top', '右上'],
  ['left bottom', '左下'],
  ['right bottom', '右下'],
]

/** 面板（名字 / 状态卡 / 授权页）停在哪一角。 */
const PANEL_LAYOUTS = [
  ['lb', '左下'],
  ['lc', '左中'],
  ['lt', '左上'],
  ['rb', '右下'],
  ['rc', '右中'],
  ['rt', '右上'],
]

function segRow(label, key, options) {
  return (
    '<div class="group"><span class="k">' +
    label +
    '</span><div class="seg" data-key="' +
    key +
    '">' +
    options.map(([value, text]) => `<button data-v="${value}">${text}</button>`).join('') +
    '</div></div>'
  )
}

function rangeRow(label, key, min, max, step, unit) {
  return (
    '<div class="group"><span class="k">' +
    label +
    '</span><input type="range" data-key="' +
    key +
    '" data-kind="num" min="' +
    String(min) +
    '" max="' +
    String(max) +
    '" step="' +
    String(step) +
    '"><output class="out" data-out="' +
    key +
    '"></output>' +
    (unit ? `<span class="unit">${unit}</span>` : '') +
    '</div>'
  )
}

function textRow(label, field, placeholder) {
  return (
    '<div class="group"><span class="k">' +
    label +
    '</span><input type="text" data-text="' +
    field +
    '" spellcheck="false" placeholder="' +
    placeholder +
    '"></div>'
  )
}

function buildPanel() {
  const defaults = JSON.stringify(PANEL_DEFAULTS)
  const textDefaults = JSON.stringify(PANEL_TEXT)
  const positions = JSON.stringify(PANEL_POSITIONS)
  const layouts = JSON.stringify(PANEL_LAYOUTS)

  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>星图开机</title>
<meta name="viewport" content="width=device-width,initial-scale=1">
<style>
  :root{color-scheme:dark}
  *{box-sizing:border-box}
  body{margin:0;min-height:100vh;background:#04070f;color:#dfe9ff;
    font-family:"Segoe UI Variable Display","Microsoft YaHei UI",system-ui,sans-serif;
    display:flex;justify-content:center;padding:56px 24px 96px}
  main{width:min(720px,100%)}
  h1{margin:0 0 6px;font-size:20px;font-weight:400;letter-spacing:.18em;color:#eef4ff}
  p.sub{margin:0 0 30px;font-size:12px;letter-spacing:.06em;color:rgba(169,201,255,.5)}
  h2{margin:34px 0 4px;font-size:10.5px;font-weight:500;letter-spacing:.32em;text-transform:uppercase;
    color:rgba(169,201,255,.42)}
  .group{display:flex;align-items:center;gap:14px;padding:11px 0;border-top:1px solid rgba(169,201,255,.09)}
  .group.first{border-top:0}
  .k{width:96px;flex:none;font-size:11px;letter-spacing:.18em;color:rgba(169,201,255,.5)}
  .seg{display:flex;border:1px solid rgba(169,201,255,.22);border-radius:9px;overflow:hidden}
  .seg button{border:0;background:transparent;color:rgba(223,233,255,.62);font:inherit;font-size:12.5px;
    padding:6px 13px;cursor:pointer}
  .seg button+button{border-left:1px solid rgba(169,201,255,.16)}
  .seg button:hover{background:rgba(169,201,255,.1)}
  .seg button.on{background:rgba(169,201,255,.9);color:#04070f}
  input[type=text],select{flex:1;min-width:0;background:transparent;border:1px solid rgba(169,201,255,.22);
    border-radius:9px;padding:8px 12px;color:#eef4ff;font:inherit;font-size:12.5px}
  select{flex:none;padding:7px 10px}
  input[type=range]{flex:1;min-width:0;accent-color:#a9c9ff;height:18px}
  input[type=color]{width:38px;height:28px;padding:0;border:1px solid rgba(169,201,255,.22);
    border-radius:7px;background:transparent;cursor:pointer}
  input:focus,select:focus{outline:2px solid rgba(169,201,255,.45);outline-offset:1px}
  .out{width:46px;flex:none;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;
    color:rgba(223,233,255,.7)}
  .unit{font-size:11px;color:rgba(169,201,255,.4)}
  .row{display:flex;gap:8px;margin-top:16px;flex-wrap:wrap}
  .btn{border:1px solid rgba(169,201,255,.22);background:transparent;color:#dfe9ff;font:inherit;font-size:12.5px;
    padding:8px 16px;border-radius:9px;cursor:pointer}
  .btn:hover{background:rgba(169,201,255,.12)}
  .btn.primary{border-color:rgba(169,201,255,.5);color:#eef4ff}
  .note{margin-top:12px;font-size:12px;line-height:1.7;color:rgba(169,201,255,.5)}
  .note.bad{color:#ff9a8a}
  textarea{width:100%;height:150px;margin-top:10px;background:rgba(169,201,255,.04);color:#cfe0ff;
    border:1px solid rgba(169,201,255,.18);border-radius:9px;padding:10px 12px;font-size:11px;
    font-family:ui-monospace,Consolas,monospace;resize:vertical}
  .hide{display:none}
</style></head><body><main>
<h1>星图开机</h1>
<p class="sub">改完即存。片头下次启动 DSH 时读取这里的一切。</p>

<h2>开关</h2>
${segRow('模式', 'dsh-star-boot:mode', [['off', '关闭'], ['simple', '简洁'], ['card', '状态卡']])}
${segRow('节奏', 'dsh-star-boot:pace', [['fast', '快'], ['normal', '标准'], ['slow', '慢']])}
${segRow('授权页', 'dsh-star-boot:auth', [['on', '开'], ['off', '关']])}
${segRow('立体字', 'dsh-star-boot:mark', [['on', '开'], ['off', '关']])}
${segRow('字样式', 'dsh-star-boot:markStyle', [['glass', '玻璃'], ['outline', '描边'], ['extrude', '挤出']])}
${segRow('文字叠加', 'dsh-star-boot:overlay', [['on', '开'], ['off', '关']])}
${segRow('音效', 'dsh-star-boot:sound', [['on', '开'], ['off', '关']])}
${segRow('素材跟播', 'dsh-star-boot:hold', [['on', '开'], ['off', '关']])}
<div class="note" style="margin-top:0">素材跟播＝背景是视频时，等它播完再进场（最多 15 秒）。关掉就按片头自己的节奏走。</div>

<h2>外观</h2>
${segRow('配色', 'dsh-star-boot:scheme', [['star', '星蓝'], ['warm', '暖光'], ['violet', '靛紫'], ['ice', '素白']])}
<div class="group"><span class="k">主色</span><input type="color" data-key="dsh-star-boot:accent" data-kind="accent">
  <button class="btn" id="accent-clear">用配色自带</button>
  <span class="note" style="margin:0">覆盖四套配色的强调色</span></div>
${segRow('字体', 'dsh-star-boot:font', [['system', '默认'], ['serif', '衬线'], ['mono', '等宽'], ['round', '圆体']])}
${rangeRow('标题大小', 'dsh-star-boot:titleScale', 70, 140, 5, '%')}
${rangeRow('立体字大小', 'dsh-star-boot:markScale', 60, 160, 5, '%')}
${rangeRow('字透明', 'dsh-star-boot:markOpacity', 0, 100, 1, '%')}
${segRow('素材适配', 'dsh-star-boot:fit', [['cover', '铺满'], ['contain', '完整']])}
<div class="group"><span class="k">素材位置</span><select data-key="dsh-star-boot:pos" data-kind="text" id="pos"></select></div>
${rangeRow('压暗', 'dsh-star-boot:dim', 0, 100, 1, '')}
${rangeRow('遮罩', 'dsh-star-boot:scrim', 0, 100, 1, '')}
<div class="group"><span class="k">面板位置</span><select data-key="dsh-star-boot:panel" data-kind="text" id="panel"></select>
  <span class="note" style="margin:0">名字 / 状态卡 / 授权页停在哪一角</span></div>
${rangeRow('模糊', 'dsh-star-boot:blur', 0, 20, 0.5, 'px')}
${rangeRow('音量', 'dsh-star-boot:volume', 0, 100, 1, '')}

<h2>文案</h2>
<div class="group first"><span class="k">名字</span><input type="text" data-text="name" spellcheck="false" placeholder="片头逐字点亮的名字（≤16 字）"></div>
<div class="group"><span class="k">眉标</span><input type="text" data-text="eyebrow" spellcheck="false" placeholder="名字上方那行小字"></div>
<div class="group"><span class="k">接上</span><input type="text" data-text="lineOk" spellcheck="false" placeholder="接上桥接时打的那句，{mem} 会替换成记忆条数"></div>
<div class="group"><span class="k">没接上</span><input type="text" data-text="lineNoCard" spellcheck="false" placeholder="拿不到数据时打的那句"></div>
<div class="group"><span class="k">立体字</span><input type="text" data-text="mark" spellcheck="false" placeholder="右侧转的那个词，留空就不显示"></div>
<div class="group"><span class="k">跳过提示</span><input type="text" data-text="hint" spellcheck="false" placeholder="底部那行小字，留空隐藏"></div>
<div class="group"><span class="k">授权提示</span><input type="text" data-text="authHint" spellcheck="false" placeholder="授权页底部那行，留空隐藏"></div>
<div class="row"><button class="btn" id="save-text">保存文案</button>
  <button class="btn" id="reset-text">恢复默认文案</button></div>

<h2>素材</h2>
<div class="group first"><span class="k">背景</span>
  <input type="file" id="bg-file" class="hide" accept="image/*,video/*">
  <button class="btn primary" data-pick="bg">选择文件…</button>
  <input type="text" id="bg-path" spellcheck="false" placeholder="或直接填本机图片 / 视频绝对路径（留空用随包素材）">
  <button class="btn" data-save="bg">保存路径</button></div>
<div class="group"><span class="k">音效</span>
  <input type="file" id="audio-file" class="hide" accept="audio/*">
  <button class="btn primary" data-pick="audio">选择文件…</button>
  <input type="text" id="audio-path" spellcheck="false" placeholder="或直接填本机 mp3 / wav / ogg 绝对路径（留空 = 没有声音）">
  <button class="btn" data-save="audio">保存路径</button></div>
<div class="note" id="asset-note"></div>
<div class="note">点「选择文件…」直接挑；也可以把文件拖进这个页面。选完会自动导入（拷一份到 &lt;DSH 数据目录&gt;\\star-boot-assets），之后片头读的是那份拷贝。</div>

<h2>更新</h2>
<div class="group first"><span class="k">版本</span><span class="note" id="ver" style="margin:0">读取中…</span>
  <button class="btn" id="check-update">检查更新</button>
  <button class="btn primary" id="do-update" style="display:none">一键更新</button></div>
<div class="note" id="update-note"></div>

<h2>配置</h2>
<div class="row"><button class="btn" id="export">导出配置</button>
  <button class="btn" id="import">导入配置</button>
  <button class="btn" id="reset-all">全部恢复默认</button></div>
<textarea id="json" spellcheck="false" placeholder="导出的配置会出现在这里；粘贴别人的配置后点「导入配置」"></textarea>
<div class="note" id="note"></div>
</main>
<script>
  var DEFAULTS = ${defaults};
  var TEXT_DEFAULTS = ${textDefaults};
  var POSITIONS = ${positions};
  var LAYOUTS = ${layouts};
  var TEXT_KEY = 'dsh-star-boot:text';

  function read(key){
    try {
      var v = window.localStorage.getItem(key);
      return v === null ? (DEFAULTS[key] === undefined ? '' : DEFAULTS[key]) : v;
    } catch (error) { return DEFAULTS[key] || ''; }
  }
  function write(key, value){
    try {
      if (value === '' || value === DEFAULTS[key]) window.localStorage.removeItem(key);
      else window.localStorage.setItem(key, value);
    } catch (error) {}
  }
  function note(text, bad){
    var node = document.getElementById('note');
    node.textContent = text;
    node.className = bad ? 'note bad' : 'note';
  }

  var posSelect = document.getElementById('pos');
  POSITIONS.forEach(function(pair){
    var option = document.createElement('option');
    option.value = pair[0];
    option.textContent = pair[1];
    posSelect.appendChild(option);
  });

  var panelSelect = document.getElementById('panel');
  LAYOUTS.forEach(function(pair){
    var option = document.createElement('option');
    option.value = pair[0];
    option.textContent = pair[1];
    panelSelect.appendChild(option);
  });

  // 分段按钮
  document.querySelectorAll('.seg[data-key]').forEach(function(seg){
    var key = seg.getAttribute('data-key');
    function paint(){
      var cur = read(key);
      seg.querySelectorAll('button').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-v') === cur);
      });
    }
    seg.addEventListener('click', function(event){
      var btn = event.target.closest('button');
      if (!btn) return;
      write(key, btn.getAttribute('data-v'));
      paint();
    });
    paint();
  });

  // 滑杆 / 下拉 / 取色
  document.querySelectorAll('[data-kind]').forEach(function(el){
    var key = el.getAttribute('data-key');
    var kind = el.getAttribute('data-kind');
    var out = document.querySelector('[data-out="' + key + '"]');
    function paint(){
      var cur = read(key);
      if (kind === 'accent') el.value = cur && /^#[0-9a-fA-F]{6}$/.test(cur) ? cur : '#a9c9ff';
      else if (kind === 'text') el.value = cur;
      else el.value = Number(cur);
      if (out) out.textContent = String(el.value);
    }
    el.addEventListener('input', function(){
      write(key, el.value);
      if (out) out.textContent = String(el.value);
    });
    el.addEventListener('change', function(){
      write(key, el.value);
      if (out) out.textContent = String(el.value);
    });
    paint();
  });
  document.getElementById('accent-clear').addEventListener('click', function(){
    write('dsh-star-boot:accent', '');
    document.querySelector('[data-key="dsh-star-boot:accent"]').value = '#a9c9ff';
    note('已改回配色自带的强调色。');
  });

  // 文案
  function readText(){
    var out = {};
    var raw = {};
    try { raw = JSON.parse(window.localStorage.getItem(TEXT_KEY) || '{}') || {}; } catch (error) { raw = {}; }
    Object.keys(TEXT_DEFAULTS).forEach(function(key){
      out[key] = typeof raw[key] === 'string' ? raw[key] : TEXT_DEFAULTS[key];
    });
    return out;
  }
  function fillText(){
    var t = readText();
    document.querySelectorAll('[data-text]').forEach(function(el){
      el.value = t[el.getAttribute('data-text')];
      el.dataset.last = el.value;
    });
  }
  document.querySelectorAll('[data-text]').forEach(function(el){
    el.addEventListener('change', function(){
      var next = readText();
      next[el.getAttribute('data-text')] = el.value;
      write(TEXT_KEY, JSON.stringify(next));
      note('文案已保存。');
    });
  });
  document.getElementById('save-text').addEventListener('click', function(){
    var next = readText();
    document.querySelectorAll('[data-text]').forEach(function(el){
      next[el.getAttribute('data-text')] = el.value;
    });
    write(TEXT_KEY, JSON.stringify(next));
    note('文案已保存。');
  });
  document.getElementById('reset-text').addEventListener('click', function(){
    try { window.localStorage.removeItem(TEXT_KEY); } catch (error) {}
    fillText();
    note('已恢复默认文案。');
  });

  // 素材
  function paintAssets(payload){
    if (!payload) return;
    var slots = payload.slots || {};
    document.getElementById('bg-path').value = (slots.bg && slots.bg.path) || '';
    document.getElementById('audio-path').value = (slots.audio && slots.audio.path) || '';
    var lines = [];
    var bg = slots.bg || {};
    lines.push('背景：' + (bg.usable ? bg.effective : bg.effective ? '随包素材（' + (bg.reason || '') + '）' : '不可用'));
    var audio = slots.audio || {};
    lines.push('音效：' + (audio.usable ? audio.effective : '未设置'));
    var node = document.getElementById('asset-note');
    node.textContent = lines.join(' · ');
    node.className = audio.path && !audio.usable ? 'note bad' : 'note';
  }
  function loadAssets(){
    fetch('/dsh-star-boot/config', { cache: 'no-store' })
      .then(function(response){ return response.json(); })
      .then(function(payload){
        paintAssets(payload);
        // 旧宿主回的 /config 没有 slots：这时「选择文件」必然 405，先说清楚。
        if (!payload || payload.slots === undefined) {
          note('宿主还是旧版本（/config 里没有 slots）。重启 DSH 之后「选择文件」才能用；现在只能靠重启前手填的路径。', true);
        }
      })
      .catch(function(){});
  }
  document.querySelectorAll('[data-save]').forEach(function(btn){
    btn.addEventListener('click', function(){
      var slot = btn.getAttribute('data-save');
      var input = document.getElementById(slot + '-path');
      fetch('/dsh-star-boot/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ slot: slot, path: input.value.trim() })
      }).then(function(response){ return response.json(); }).then(function(data){
        if (data.ok) { paintAssets(data); note((slot === 'bg' ? '背景' : '音效') + '已保存。'); }
        else note('保存失败：' + (data.error || '?'), true);
      }).catch(function(error){ note('保存失败：' + error.message, true); });
    });
  });

  // 选文件 = 直接导入：浏览器给不了绝对路径，所以把字节交给宿主落盘。
  function upload(slot, file){
    var label = slot === 'audio' ? '音效' : '背景';
    note('正在导入 ' + file.name + ' …');
    fetch('/dsh-star-boot/upload', {
      method: 'POST',
      headers: {
        'x-star-slot': slot,
        'x-star-name': encodeURIComponent(file.name),
        'content-type': file.type || 'application/octet-stream'
      },
      body: file
    }).then(function(response){
      if (!response.ok) {
        var hint = (response.status === 404 || response.status === 405)
          ? '，宿主还是旧版本——要重启 DSH（不是刷新页面）' : '';
        throw new Error('HTTP ' + response.status + hint);
      }
      return response.json();
    }).then(function(data){
      if (data.ok) { paintAssets(data); note('已换成 ' + file.name + '（' + label + '）。'); }
      else note('导入失败：' + (data.error || '?'), true);
    }).catch(function(error){ note('导入失败：' + error.message, true); });
  }
  document.querySelectorAll('[data-pick]').forEach(function(btn){
    var slot = btn.getAttribute('data-pick');
    var input = document.getElementById(slot + '-file');
    btn.addEventListener('click', function(){ input.click(); });
    input.addEventListener('change', function(){
      var file = input.files && input.files[0];
      if (file) upload(slot, file);
      input.value = '';
    });
  });

  // 拖进来也行：按扩展名猜是背景还是音效。
  var AUDIO_EXT = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.flac'];
  document.addEventListener('dragover', function(event){ event.preventDefault(); });
  document.addEventListener('drop', function(event){
    event.preventDefault();
    var files = event.dataTransfer && event.dataTransfer.files;
    if (!files || files.length === 0) return;
    for (var i = 0; i < files.length; i += 1) {
      var file = files[i];
      var dot = file.name.lastIndexOf('.');
      var ext = dot < 0 ? '' : file.name.slice(dot).toLowerCase();
      upload(AUDIO_EXT.indexOf(ext) >= 0 ? 'audio' : 'bg', file);
    }
  });

  // 导出 / 导入
  document.getElementById('export').addEventListener('click', function(){
    var dump = { localStorage: {}, text: readText() };
    Object.keys(DEFAULTS).forEach(function(key){ dump.localStorage[key] = read(key); });
    document.getElementById('json').value = JSON.stringify(dump, null, 2);
    note('已导出，复制走即可。');
  });
  document.getElementById('import').addEventListener('click', function(){
    var dump;
    try { dump = JSON.parse(document.getElementById('json').value); } catch (error) {
      note('不是合法 JSON。', true);
      return;
    }
    var store = dump && dump.localStorage ? dump.localStorage : dump;
    Object.keys(DEFAULTS).forEach(function(key){
      if (typeof store[key] === 'string') write(key, store[key]);
    });
    if (dump && dump.text && typeof dump.text === 'object') {
      write(TEXT_KEY, JSON.stringify(dump.text));
    }
    var assets = dump && dump.assets;
    if (assets && typeof assets === 'object') {
      fetch('/dsh-star-boot/config', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ assets: assets })
      }).then(function(response){ return response.json(); }).then(paintAssets).catch(function(){});
    }
    fillText();
    document.querySelectorAll('[data-kind]').forEach(function(el){
      var key = el.getAttribute('data-key');
      var kind = el.getAttribute('data-kind');
      var out = document.querySelector('[data-out="' + key + '"]');
      if (kind === 'text') el.value = read(key);
      else if (kind === 'accent') el.value = /^#[0-9a-fA-F]{6}$/.test(read(key)) ? read(key) : '#a9c9ff';
      else el.value = Number(read(key));
      if (out) out.textContent = String(el.value);
    });
    document.querySelectorAll('.seg[data-key]').forEach(function(seg){
      var key = seg.getAttribute('data-key');
      var cur = read(key);
      seg.querySelectorAll('button').forEach(function(b){
        b.classList.toggle('on', b.getAttribute('data-v') === cur);
      });
    });
    note('已导入。片头下次启动生效。');
  });
  document.getElementById('reset-all').addEventListener('click', function(){
    try {
      Object.keys(DEFAULTS).forEach(function(key){ window.localStorage.removeItem(key); });
      window.localStorage.removeItem(TEXT_KEY);
    } catch (error) {}
    location.reload();
  });

  // 版本 + 检查更新 / 一键更新
  function updateNote(text, bad){
    var node = document.getElementById('update-note');
    node.textContent = text;
    node.className = bad ? 'note bad' : 'note';
  }
  function loadVersion(){
    fetch('/dsh-star-boot/config', { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(d){ document.getElementById('ver').textContent = 'v' + (d.version || '?'); })
      .catch(function(){});
  }
  document.getElementById('check-update').addEventListener('click', function(){
    updateNote('正在检查 GitHub 上的最新版本…');
    fetch('/dsh-star-boot/update', { cache: 'no-store' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d.ok) { updateNote('检查失败：' + (d.error || '?'), true); return; }
        if (d.newer) {
          updateNote('有新版本 v' + d.latest + '（当前 v' + d.current + '），点右边「一键更新」');
          document.getElementById('do-update').style.display = '';
        } else {
          updateNote('已经是最新版本 v' + d.current);
          document.getElementById('do-update').style.display = 'none';
        }
      })
      .catch(function(e){ updateNote('检查失败：' + e.message, true); });
  });
  document.getElementById('do-update').addEventListener('click', function(){
    updateNote('正在下载并替换文件，别关 DSH…');
    fetch('/dsh-star-boot/update', { method: 'POST' })
      .then(function(r){ return r.json(); })
      .then(function(d){
        if (!d.ok) { updateNote('更新失败：' + (d.error || '?'), true); return; }
        if (d.alreadyLatest) { updateNote('已经是最新版本 v' + d.current); return; }
        updateNote('已更新到 v' + d.to + '，重启 DSH 生效。旧版本备份在 ' + (d.backup || ''));
        document.getElementById('do-update').style.display = 'none';
        loadVersion();
      })
      .catch(function(e){ updateNote('更新失败：' + e.message, true); });
  });

  fillText();
  loadAssets();
  loadVersion();
</script>
</main></body></html>`
}

const PANEL_HTML = buildPanel()

function panelHandler(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { allow: 'GET, HEAD' })
    res.end()
    return
  }
  res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
  res.end(req.method === 'HEAD' ? undefined : PANEL_HTML)
}

/**
 * 首帧那张「黑幕」。
 *
 * 用 `html.star-first::before` 而不是给 body 上色：文档解析到这里时 body 可能还
 * 不存在，但 <html> 一定在。pointer-events 关掉——被它盖住的启动卡本来也不可交互。
 *
 * 顺带把 550C 的宿主元素藏起来：两个片头插件同时装着时，谁在播谁说了算。
 * 这一条只在 `.star-first` 存在期间生效，播放结束就还给它。
 */
const FIRST_FRAME_CSS =
  'html.star-first::before{content:"";position:fixed;inset:0;background:' +
  FIRST_FRAME_BG +
  ';z-index:' +
  String(FIRST_FRAME_Z) +
  ';pointer-events:none}\n' +
  'html.star-first{background:' +
  FIRST_FRAME_BG +
  ';--dsw-specific-sidebar-fill:#050912;--dsw-alias-label-primary:#dfe9ff}\n' +
  'html.star-first .dsh550c-host{display:none!important}'

/**
 * 标记 + 握手 + 兜底。
 *
 * 刻意小、刻意同步：它在 <head> 里执行，所以要赶在第一帧之前把 class 加上。
 * 结束有两条路——客户端主动调 end()（正常路径），或者下面的 watch/超时（兜底）。
 */
const FIRST_FRAME_SCRIPT =
  '(function(){' +
  // 逃生口：?star=0 这一次开机就当没装过，不改任何设置。
  'try{if(location.search.indexOf("star=0")>=0)return}catch(error){}' +
  'var mode=null;' +
  'try{mode=window.localStorage.getItem(' +
  JSON.stringify(MODE_KEY) +
  ')}catch(error){}' +
  'if(mode==="off")return;' +
  'var root=document.documentElement;' +
  'var watch=null;' +
  'var end=function(){' +
  'if(watch!==null){window.clearInterval(watch);watch=null}' +
  'root.classList.remove("star-first")' +
  '};' +
  'window.' +
  FIRST_FRAME_GLOBAL +
  '={end:end};' +
  'root.classList.add("star-first");' +
  'var seen=false;' +
  'watch=window.setInterval(function(){' +
  'var card=document.querySelector("[data-dsh-boot]");' +
  'if(card===null){if(seen)end();return}' +
  'seen=true;' +
  'if(card.querySelector("[data-dsh-boot-spinner]")===null)end()' +
  '},250);' +
  'window.setTimeout(end,' +
  String(FIRST_FRAME_MAX_MS) +
  ');' +
  '})()'

/**
 * 每份 index 都拿到这三行。
 *
 * `webserver/index-inject` 是每次响应都会发的组合事件，只有真的有人在取页面
 * 时才渲染一张表——所以这里只花一行表的代价，没人访问就什么也不花。
 *
 * 四条路由走可选注入：没有 HTTP 载体的 profile 里，片头照样能播，只是设置行
 * 少了换素材/查状态的能力。
 *
 * @param ctx - 插件上下文。
 */
export function apply(ctx) {
  ctx.on('webserver/index-inject', (table) => {
    table.push({ kind: 'style', text: FIRST_FRAME_CSS })
    table.push({ kind: 'script', placement: 'head', text: FIRST_FRAME_SCRIPT })
    if (VERSION !== null) table.push({ kind: 'global', name: VERSION_GLOBAL, value: VERSION })
  })

  ctx.inject(['webServer'], (webCtx) => {
    // 每一条都单独兜住：一个路由注册不上，绝不该让整个条目「未激活」——
    // DSH 把未激活当致命错误，会直接崩启动（2026-11-02 那次连 profile 都被重置了）。
    const register = (path, handler, label) => {
      try {
        return webCtx.webServer.register({ kind: 'exact', path, handler })
      } catch (error) {
        console.error(`[dsh-star-boot] ${label} 注册失败`, error)
        return () => {}
      }
    }
    webCtx.effect(() => register(CARD_ROUTE, cardHandler, 'card'), `star-boot: GET ${CARD_ROUTE}`)
    webCtx.effect(() => register(ASSET_ROUTE, assetHandler, 'asset'), `star-boot: GET ${ASSET_ROUTE}`)
    webCtx.effect(() => register(CONFIG_ROUTE, configHandler, 'config'), `star-boot: ${CONFIG_ROUTE}`)
    webCtx.effect(() => register(UPLOAD_ROUTE, uploadHandler, 'upload'), `star-boot: POST ${UPLOAD_ROUTE}`)
    // 同一路径只登记一次：GET 查版本，POST 真的更新。
    const updateHandler = (req, res) => (req.method === 'POST' ? updateApplyHandler(req, res) : updateCheckHandler(req, res))
    webCtx.effect(() => register(UPDATE_ROUTE, updateHandler, 'update'), `star-boot: ${UPDATE_ROUTE}`)
    webCtx.effect(() => register(PANEL_ROUTE, panelHandler, 'panel'), `star-boot: GET ${PANEL_ROUTE}`)
  })
}

/** 给预览脚本用的真实注入行（不是另写一份近似物）。 */
export const firstFrame = { css: FIRST_FRAME_CSS, script: FIRST_FRAME_SCRIPT, bg: FIRST_FRAME_BG }

/** 给测试用：版本比较是纯函数，单独验比整条链路好验。 */
export { isNewerVersion, parseVersion }
