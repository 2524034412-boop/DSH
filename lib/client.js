window.__ModuleLoader__.load({
  // 浏览器这份工件的 id 必须等于**包名**（DSH 的文档要求如此），不是条目 id。
  id: 'dsh-star-boot',
  factory(require) {
    var module = { exports: {} }
    var exports = module.exports
    const React = require('react')
    const h = React.createElement

    /* ============================================================
     * 契约（必须和 lib/index.js 对齐）
     * ========================================================== */

    const MODE_KEY = 'dsh-star-boot:mode'
    const MODE_VALUES = ['off', 'simple', 'card']
    const DEFAULT_MODE = 'card'
    const FIRST_FRAME_GLOBAL = '__dshStarFirstFrame'
    const VERSION_GLOBAL = '__dshStarVersion'

    const SCHEME_KEY = 'dsh-star-boot:scheme'
    const SCHEME_VALUES = ['star', 'warm', 'violet', 'ice']
    const PACE_KEY = 'dsh-star-boot:pace'
    const PACE_VALUES = ['fast', 'normal', 'slow']
    const AUTH_KEY = 'dsh-star-boot:auth'
    const AUTH_VALUES = ['on', 'off']
    const MARK_KEY = 'dsh-star-boot:mark'
    const MARK_VALUES = ['on', 'off']
    /** 那个词长什么样：玻璃 / 描边 / 挤出。 */
    const MARK_STYLE_KEY = 'dsh-star-boot:markStyle'
    const MARK_STYLE_VALUES = ['glass', 'outline', 'extrude']
    const MARK_OP_KEY = 'dsh-star-boot:markOpacity'
    /** 文字层（名字 / 眉标 / 打字行 / 状态卡）压不压在素材上。 */
    const OVERLAY_KEY = 'dsh-star-boot:overlay'
    const OVERLAY_VALUES = ['on', 'off']
    /** 音效：默认关。开机不出声是起码的礼貌，要响得自己开。 */
    const SOUND_KEY = 'dsh-star-boot:sound'
    const SOUND_VALUES = ['on', 'off']
    /**
     * 素材跟播：背景是视频时，等它播完再进场。
     * 默认开——不然 10 秒的片子每次都被切掉尾巴，看着就是「没播完」。
     */
    const HOLD_KEY = 'dsh-star-boot:hold'
    const HOLD_VALUES = ['on', 'off']
    /** 上限：再长的片子也不把开机拖过 15 秒。 */
    const HOLD_CAP_MS = 15000

    /* ---- 外观：全是可调项，默认值就是 1.3 的样子 ---- */

    const FONT_KEY = 'dsh-star-boot:font'
    const FONT_VALUES = ['system', 'serif', 'mono', 'round']
    const FIT_KEY = 'dsh-star-boot:fit'
    const FIT_VALUES = ['cover', 'contain']
    /** object-position 的原生取值，按九宫格摆。 */
    const POS_KEY = 'dsh-star-boot:pos'
    const POS_VALUES = ['center', 'top', 'bottom', 'left', 'right', 'left top', 'right top', 'left bottom', 'right bottom']
    /** 面板（名字 / 状态卡 / 授权页）停在画面的哪个角。 */
    const PANEL_KEY = 'dsh-star-boot:panel'
    const PANEL_VALUES = ['lb', 'lc', 'lt', 'rb', 'rc', 'rt']
    const DIM_KEY = 'dsh-star-boot:dim'
    const SCRIM_KEY = 'dsh-star-boot:scrim'
    const BLUR_KEY = 'dsh-star-boot:blur'
    const ACCENT_KEY = 'dsh-star-boot:accent'
    const TITLE_SCALE_KEY = 'dsh-star-boot:titleScale'
    const MARK_SCALE_KEY = 'dsh-star-boot:markScale'
    const VOLUME_KEY = 'dsh-star-boot:volume'

    /** 滑块的范围，读和写共用一份，免得设置页和渲染层各记一个数。 */
    const RANGE = {
      // 默认给「看得清素材」的那一档：压暗 85、遮罩 60。
      // 原来的 50/80 等于把素材砍半再压一层，视频看着灰蒙蒙的。
      [DIM_KEY]: [0, 100, 85],
      [SCRIM_KEY]: [0, 100, 60],
      [BLUR_KEY]: [0, 20, 0],
      [TITLE_SCALE_KEY]: [70, 140, 100],
      [MARK_SCALE_KEY]: [60, 160, 100],
      [MARK_OP_KEY]: [0, 100, 60],
      [VOLUME_KEY]: [0, 100, 60],
    }

    /** 550C 的开关。开着的时候把它压住，否则两段片头会先后播。 */
    const OTHER_MODE_KEY = 'dsh-550c-boot:mode'
    const OTHER_BACKUP_KEY = 'dsh-star-boot:550c-was'

    const CARD_ROUTE = '/dsh-star-boot/card'
    const ASSET_ROUTE = '/dsh-star-boot/asset'
    const CONFIG_ROUTE = '/dsh-star-boot/config'
    /** 选文件后把字节交给宿主，由它落盘并写进配置。 */
    const UPLOAD_ROUTE = '/dsh-star-boot/upload'

    const HOST_CLASS = 'star-splash-host'
    const ROW_STYLE_ID = 'star-boot-row-style'

    /* ============================================================
     * 文案与节奏
     * ========================================================== */

    const EYEBROW = 'DEEPSEEK HARNESS · 星图'
    /** 她在片头和授权页里报的名字。默认值，用户在设置里改了就听用户的。 */
    const HER_NAME = '小肥鱼'
    const MARK_WORD = 'DeepSeek'
    const HINT = 'ESC 跳过'
    const AUTH_HINT = '点击 或 Enter 接入 · ESC 跳过'

    /* ---- 可以改的文案：默认值在上，用户在设置页/面板里改的存这里 ---- */

    const TEXT_KEY = 'dsh-star-boot:text'
    const DEFAULT_TEXT = {
      name: HER_NAME,
      eyebrow: EYEBROW,
      lineOk: '记忆 {mem} 条，星图已接上',
      lineNoCard: '星图未接上，先开机',
      mark: MARK_WORD,
      hint: HINT,
      authHint: AUTH_HINT,
    }

    /** 这三条留空是有意义的：留空 = 那一层不出现。 */
    const TEXT_MAY_BE_EMPTY = ['mark', 'hint', 'authHint']

    function esc(text) {
      return String(text).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[ch])
    }

    function normalizeText(raw) {
      const source = raw !== null && typeof raw === 'object' ? raw : {}
      const pick = (value, fallback, max, allowEmpty) => {
        if (typeof value !== 'string') return fallback
        const trimmed = value.replace(/[\r\n]+/g, ' ').trim()
        if (trimmed === '') return allowEmpty ? '' : fallback
        return trimmed.slice(0, max)
      }
      const out = {}
      for (const key of Object.keys(DEFAULT_TEXT)) {
        const allowEmpty = TEXT_MAY_BE_EMPTY.indexOf(key) >= 0
        out[key] = pick(source[key], DEFAULT_TEXT[key], key === 'name' ? 16 : 64, allowEmpty)
      }
      return out
    }

    function readText() {
      try {
        const raw = window.localStorage.getItem(TEXT_KEY)
        return normalizeText(raw ? JSON.parse(raw) : {})
      } catch (error) {
        return normalizeText({})
      }
    }

    function writeText(next) {
      try {
        window.localStorage.setItem(TEXT_KEY, JSON.stringify(normalizeText(next)))
      } catch (error) {
        /* 隐私模式里不持久化 */
      }
    }
    /** 淡出两段：内容先走，背景后走。和 index.js 的 FIRST_FRAME_BG 是同一个色。 */
    const FADE_MS = 640
    /** 状态卡停住的那 2 秒——用户唯一要求过的时间。 */
    const HOLD_MS = 2000
    /**
     * 最短可见时间。系统开了「减少动画」、或者某条分支走得特别快时，
     * 片头会一闪而过——短到看不清，也截不到。1500ms 是不用眼睛追的下限。
     */
    const MIN_VISIBLE_MS = 1500
    /** 减少动画时不做动画，但也不能一闪而过：静态画面停 2 秒。 */
    const REDUCE_HOLD_MS = 2000
    /** 授权页无人操作时自动进入，别把人锁在开机画面上。 */
    const AUTH_AUTO_MS = 2600
    /** 节奏三档：只缩放「等待」，不动交互。 */
    const PACE_SCALE = { fast: 0.72, normal: 1, slow: 1.35 }

    /* ============================================================
     * 存储
     * ========================================================== */

    function readEnum(key, values, fallback) {
      try {
        const raw = window.localStorage.getItem(key)
        return values.indexOf(raw) >= 0 ? raw : fallback
      } catch (error) {
        return fallback
      }
    }

    function writeEnum(key, value) {
      try {
        window.localStorage.setItem(key, value)
      } catch (error) {
        /* 隐私模式里不持久化，但本次照样生效 */
      }
    }

    const readMode = () => readEnum(MODE_KEY, MODE_VALUES, DEFAULT_MODE)
    const writeMode = (mode) => writeEnum(MODE_KEY, mode)

    /** 滑块值：读的时候夹在范围内，写的时候和默认值相同就不落盘。 */
    function readNumber(key) {
      const spec = RANGE[key] ?? [0, 100, 0]
      try {
        // 注意 Number(null) === 0：没存过这一项时必须先判空，否则会被夹成最小值。
        const stored = window.localStorage.getItem(key)
        if (stored === null || stored.trim() === '') return spec[2]
        const raw = Number(stored)
        if (!Number.isFinite(raw)) return spec[2]
        return Math.min(spec[1], Math.max(spec[0], raw))
      } catch (error) {
        return spec[2]
      }
    }

    function writeNumber(key, value) {
      const spec = RANGE[key] ?? [0, 100, 0]
      const next = Number(value)
      try {
        if (!Number.isFinite(next) || next === spec[2]) window.localStorage.removeItem(key)
        else window.localStorage.setItem(key, String(Math.min(spec[1], Math.max(spec[0], next))))
      } catch (error) {
        /* 隐私模式里不持久化 */
      }
    }

    /** 主色：只收 #rrggbb；留空 = 用配色自带的那套。 */
    function readAccent() {
      try {
        const raw = window.localStorage.getItem(ACCENT_KEY)
        return typeof raw === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw) ? raw.toLowerCase() : ''
      } catch (error) {
        return ''
      }
    }

    function writeAccent(value) {
      try {
        if (typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value)) window.localStorage.setItem(ACCENT_KEY, value.toLowerCase())
        else window.localStorage.removeItem(ACCENT_KEY)
      } catch (error) {
        /* 同上 */
      }
    }

    /** 把一个强调色拆成主题里那五个变量，透明度沿用配色自带的比例。 */
    function accentVars(hex) {
      const value = hex.replace('#', '')
      const r = parseInt(value.slice(0, 2), 16)
      const g = parseInt(value.slice(2, 4), 16)
      const b = parseInt(value.slice(4, 6), 16)
      const mix = (alpha) => `rgba(${String(r)},${String(g)},${String(b)},${String(alpha)})`
      return {
        '--accent': hex,
        '--accent-dim': mix(0.48),
        '--accent-line': mix(0.14),
        '--accent-soft': mix(0.19),
        '--accent-glow': mix(0.36),
      }
    }

    function readSettings() {
      return {
        mode: readMode(),
        scheme: readEnum(SCHEME_KEY, SCHEME_VALUES, 'star'),
        pace: readEnum(PACE_KEY, PACE_VALUES, 'normal'),
        auth: readEnum(AUTH_KEY, AUTH_VALUES, 'on'),
        mark: readEnum(MARK_KEY, MARK_VALUES, 'on'),
        markStyle: readEnum(MARK_STYLE_KEY, MARK_STYLE_VALUES, 'glass'),
        markOpacity: readNumber(MARK_OP_KEY),
        overlay: readEnum(OVERLAY_KEY, OVERLAY_VALUES, 'on'),
        sound: readEnum(SOUND_KEY, SOUND_VALUES, 'off'),
        hold: readEnum(HOLD_KEY, HOLD_VALUES, 'on'),
        font: readEnum(FONT_KEY, FONT_VALUES, 'system'),
        fit: readEnum(FIT_KEY, FIT_VALUES, 'cover'),
        pos: readEnum(POS_KEY, POS_VALUES, 'center'),
        panel: readEnum(PANEL_KEY, PANEL_VALUES, 'lb'),
        dim: readNumber(DIM_KEY),
        scrim: readNumber(SCRIM_KEY),
        blur: readNumber(BLUR_KEY),
        accent: readAccent(),
        titleScale: readNumber(TITLE_SCALE_KEY),
        markScale: readNumber(MARK_SCALE_KEY),
        volume: readNumber(VOLUME_KEY),
      }
    }

    function muteOtherSplash() {
      try {
        const current = window.localStorage.getItem(OTHER_MODE_KEY)
        if (current !== null && current !== 'off' && window.localStorage.getItem(OTHER_BACKUP_KEY) === null) {
          window.localStorage.setItem(OTHER_BACKUP_KEY, current)
        }
        window.localStorage.setItem(OTHER_MODE_KEY, 'off')
      } catch (error) {
        /* 没有 550C、或存储不可用，都不影响自己播 */
      }
    }

    function restoreOtherSplash() {
      try {
        const backup = window.localStorage.getItem(OTHER_BACKUP_KEY)
        if (backup === null) return
        window.localStorage.setItem(OTHER_MODE_KEY, backup)
        window.localStorage.removeItem(OTHER_BACKUP_KEY)
      } catch (error) {
        /* 同上 */
      }
    }

    /**
     * 550C 可能比我们早一步挂上了它的片头（加载顺序不归我们定）。
     *
     * 处理方式是**藏起来而不是摘掉**：它的动画循环还握着那些节点的引用，
     * 直接 remove 会让它每一帧都往控制台丢异常。display:none 既看不见，
     * 也不打扰它——它自己走完会把节点收走，我们这边只负责这一屏归谁。
     */
    function clearOtherSplash() {
      try {
        const nodes = document.querySelectorAll('.dsh550c-host')
        for (const node of nodes) {
          node.style.display = 'none'
          node.style.pointerEvents = 'none'
        }
      } catch (error) {
        /* 藏不住算了，CSS 那一层还挡着 */
      }
    }

    /* ============================================================
     * 星点：固定种子，所以每次开机是同一片星空
     * ========================================================== */

    function starField(count) {
      let seed = 20261102
      const rnd = () => {
        seed = (seed * 1103515245 + 12345) & 0x7fffffff
        return seed / 0x7fffffff
      }
      let out = ''
      for (let i = 0; i < count; i += 1) {
        const left = (rnd() * 100).toFixed(2)
        const top = (rnd() * 100).toFixed(2)
        const size = (rnd() * 1.6 + 0.6).toFixed(2)
        const delay = (rnd() * 2600).toFixed(0)
        const dur = (2600 + rnd() * 5200).toFixed(0)
        const peak = (0.25 + rnd() * 0.65).toFixed(2)
        out +=
          '<span style="left:' +
          left +
          '%;top:' +
          top +
          '%;width:' +
          size +
          'px;height:' +
          size +
          'px;animation-delay:-' +
          delay +
          'ms;animation-duration:' +
          dur +
          'ms;--peak:' +
          peak +
          '"></span>'
      }
      return out
    }

    /* ============================================================
     * 样式
     *
     * 颜色全部走 CSS 变量：四套配色只是换一组变量，规则本身一份。
     * ========================================================== */

    const CSS = `
:host{--accent:#a9c9ff;--accent-dim:rgba(169,201,255,.46);--accent-line:rgba(169,201,255,.13);
  --accent-soft:rgba(169,201,255,.18);--accent-glow:rgba(96,146,246,.36);--ink:#eef4ff;--ink-soft:#b9cdf5;
  position:fixed;inset:0;display:block;z-index:2147483001;background:#04070f;overflow:hidden;
  font-family:"Segoe UI Variable Display","Microsoft YaHei UI","PingFang SC",system-ui,sans-serif;
  -webkit-font-smoothing:antialiased;color:var(--ink);cursor:default;user-select:none}

:host([data-scheme="warm"]){--accent:#ffd0a1;--accent-dim:rgba(255,208,161,.5);--accent-line:rgba(255,208,161,.15);
  --accent-soft:rgba(255,208,161,.2);--accent-glow:rgba(255,158,74,.34);--ink:#fff4e8;--ink-soft:#f2dcc2}
:host([data-scheme="violet"]){--accent:#c6b4ff;--accent-dim:rgba(198,180,255,.48);--accent-line:rgba(198,180,255,.14);
  --accent-soft:rgba(198,180,255,.19);--accent-glow:rgba(146,110,246,.38);--ink:#f1ecff;--ink-soft:#d3c7f5}
:host([data-scheme="ice"]){--accent:#e6eefc;--accent-dim:rgba(230,238,252,.5);--accent-line:rgba(230,238,252,.15);
  --accent-soft:rgba(230,238,252,.2);--accent-glow:rgba(150,190,255,.3);--ink:#fbfdff;--ink-soft:#cfdced}

.stage{position:absolute;inset:0;transition:opacity 420ms cubic-bezier(.4,0,.2,1)}
:host(.out) .stage{opacity:0}
:host(.out){opacity:0;transition:opacity 420ms ease 200ms}

.bg{position:absolute;inset:0;background:
  radial-gradient(120% 82% at 76% 108%,color-mix(in srgb,var(--accent) 26%,transparent),transparent 62%),
  radial-gradient(72% 58% at 6% -8%,color-mix(in srgb,var(--accent) 14%,transparent),transparent 60%),
  #04070f}

.stars{position:absolute;inset:0;opacity:0;transition:opacity 1200ms ease}
.stars.on{opacity:1}
.stars span{position:absolute;border-radius:50%;background:#dbe7ff;
  box-shadow:0 0 4px rgba(190,214,255,.65);opacity:0;
  animation-name:tw;animation-iteration-count:infinite;animation-timing-function:ease-in-out}
@keyframes tw{0%,100%{opacity:0}50%{opacity:var(--peak,.5)}}

.shot{position:absolute;inset:0;opacity:0;transform:scale(1.07);will-change:opacity,transform;
  transition:opacity 1500ms ease,transform 3200ms cubic-bezier(.18,.7,.2,1)}
/* 素材怎么摆、压多暗、糊不糊，全是变量——设置页改的就是这几个数。 */
.shot img,.shot video{width:100%;height:100%;display:block;object-fit:var(--shot-fit,cover);
  object-position:var(--shot-pos,center);
  filter:blur(var(--shot-blur,0px)) saturate(var(--shot-sat,1))}
/* 模糊会把边缘吃进来，稍微放大一点把毛边推出画框 */
.shot.blurred img,.shot.blurred video{transform:scale(var(--shot-zoom,1.06))}
.shot.on{opacity:var(--shot-op,.5);transform:scale(1)}
/* 视频亮度不可控，左侧再多压一层，保证文字读得出来 */
.shot.is-video::after{opacity:var(--shot-scrim,1);background:
  linear-gradient(90deg,#04070f 0%,rgba(4,7,15,.95) 26%,rgba(4,7,15,.62) 48%,rgba(4,7,15,.20) 68%,rgba(4,7,15,.44) 100%),
  linear-gradient(0deg,#04070f 0%,#04070f 14%,rgba(4,7,15,.80) 32%,rgba(4,7,15,0) 60%),
  radial-gradient(120% 90% at 62% 40%,rgba(4,7,15,0) 30%,rgba(2,4,10,.70) 100%)}
.shot.dim{opacity:.32;transition:opacity 900ms ease}
.shot::after{content:"";position:absolute;inset:0;pointer-events:none;opacity:var(--shot-scrim,1);background:
  linear-gradient(90deg,#04070f 0%,rgba(4,7,15,.90) 22%,rgba(4,7,15,.42) 46%,rgba(4,7,15,.14) 66%,rgba(4,7,15,.52) 100%),
  linear-gradient(0deg,#04070f 0%,#04070f 13%,rgba(4,7,15,.74) 30%,rgba(4,7,15,0) 58%),
  radial-gradient(120% 90% at 62% 40%,rgba(4,7,15,0) 34%,rgba(2,4,10,.62) 100%)}

.vig{position:absolute;inset:0;pointer-events:none;
  background:repeating-linear-gradient(to bottom,rgba(255,255,255,.014) 0 1px,rgba(255,255,255,0) 1px 4px)}

.text{position:absolute;left:var(--panel-left,7.5vw);right:var(--panel-right,auto);
  bottom:var(--panel-b,15vh);max-width:min(54ch,48vw);z-index:3;
  transition:opacity 380ms ease,transform 380ms ease}
.text.gone{opacity:0;transform:translateY(-8px)}
.eyebrow{display:flex;align-items:center;gap:10px;font-size:10px;line-height:1;
  letter-spacing:.36em;text-transform:uppercase;color:var(--accent-dim);
  opacity:0;transform:translateY(6px);transition:opacity 800ms ease,transform 800ms ease}
.eyebrow i{width:5px;height:5px;border-radius:50%;background:var(--accent);box-shadow:0 0 10px var(--accent-glow);flex:none}
.eyebrow.on{opacity:1;transform:none}

.rule{height:1px;width:0;margin:15px 0 20px;
  background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 62%,transparent),transparent);
  transition:width 1000ms cubic-bezier(.2,.7,.2,1)}
.rule.on{width:min(240px,30vw)}

.title{margin:0;font-size:calc(clamp(30px,3.9vw,52px) * var(--title-scale,1));font-weight:300;line-height:1.08;
  letter-spacing:.16em;color:var(--ink);text-shadow:0 0 30px var(--accent-glow)}
:host([data-font="serif"]) .title{font-family:"Songti SC","Source Han Serif SC","Noto Serif CJK SC",Georgia,serif;
  letter-spacing:.1em}
:host([data-font="mono"]) .title{font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;letter-spacing:.06em}
:host([data-font="round"]) .title{font-family:"Segoe UI Variable Display","Microsoft YaHei UI",system-ui,sans-serif;
  font-weight:400;letter-spacing:.14em}
.title .ch{display:inline-block;opacity:0;transform:translateY(16px);filter:blur(12px);
  transition:opacity 700ms ease,transform 700ms cubic-bezier(.2,.7,.2,1),filter 700ms ease}
.title .ch.on{opacity:1;transform:none;filter:none}
.title .sp{display:inline-block;width:.36em}

.line{margin-top:16px;min-height:1.5em;font-family:ui-monospace,"Cascadia Mono",Consolas,monospace;
  font-size:12.5px;letter-spacing:.05em;color:var(--ink-soft);opacity:0;transition:opacity 400ms ease}
.line.on{opacity:1}
.line .p{color:var(--accent-dim);margin-right:.55em}
.line .cur{display:inline-block;width:7px;height:13px;background:var(--accent);vertical-align:-2px;
  margin-left:4px;animation:blink 1.05s steps(1) infinite}
@keyframes blink{0%,49%{opacity:.9}50%,100%{opacity:0}}

.bar{margin-top:24px;width:min(260px,34vw);height:1px;background:var(--accent-line);overflow:hidden}
.bar i{display:block;height:100%;width:0;
  background:linear-gradient(90deg,color-mix(in srgb,var(--accent) 88%,transparent),var(--accent-soft));
  transition:width 2800ms linear}
.bar.on i{width:100%}

/* ===== 右侧那个词：三套气质，默认玻璃 ===== */
.mark{position:absolute;right:7vw;top:42%;width:min(62vw,900px);z-index:2;
  perspective:1600px;pointer-events:none;opacity:0;
  transform:translateY(-50%);transition:opacity 1800ms ease,filter 700ms ease;
  mix-blend-mode:normal}
.mark.on{opacity:var(--mark-op,.6)}
.mark.dim{opacity:calc(var(--mark-op,.6) * .28)}
.mark-inner{position:relative;transform-style:preserve-3d;
  transform:rotateY(-18deg) rotateX(4deg);
  animation:markFloat 26s ease-in-out infinite}
@keyframes markFloat{
  0%,100%{transform:rotateY(-18deg) rotateX(4deg) translate3d(0,0,0)}
  50%{transform:rotateY(-11deg) rotateX(2deg) translate3d(0,-10px,18px)}
}
.mark-word{display:block;margin:0;text-align:right;white-space:nowrap;
  font-family:"Segoe UI Variable Display","Segoe UI Variable Text",system-ui,sans-serif;
  font-weight:200;line-height:1;letter-spacing:.24em;text-transform:uppercase;
  font-size:calc(clamp(34px,4.4vw,64px) * var(--mark-scale,1))}

/* 玻璃层：正面渐变字 + 背后一层虚影做出「厚度」，只有一条很慢的高光扫过 */
/* 局部柔光：只在字周围压一小块暗，亮视频上才立得住，又不像整屏压暗那样盖住画面。 */
.mk-veil{position:absolute;inset:-26% -9%;pointer-events:none;
  background:radial-gradient(closest-side,rgba(3,7,14,.62),rgba(3,7,14,.30) 56%,rgba(3,7,14,0) 80%);
  filter:blur(26px)}
/* 这一层不是虚影，是「字的影子」：暗色模糊垫在字后面，亮底上才有对比，
   同时在暗底上看不出来——比整屏压暗克制得多。 */
.mk-ghost{position:absolute;inset:0;color:rgba(2,5,11,.85);filter:blur(10px);
  transform:translate3d(0,2px,-6px);pointer-events:none}
/* 亮底上白字会化掉，所以字本身挂一圈暗影：暗底上看不出，亮底上就立住了。 */
.mk-face{position:relative;color:transparent;
  background:linear-gradient(180deg,rgba(255,255,255,.98) 0%,rgba(221,236,255,.82) 44%,rgba(140,180,238,.48) 100%);
  -webkit-background-clip:text;background-clip:text;
  filter:drop-shadow(0 2px 3px rgba(6,12,24,.55)) drop-shadow(0 0 26px rgba(6,12,24,.45))}
.mk-shine{position:absolute;inset:0;overflow:hidden;pointer-events:none;opacity:.18}
.mk-shine::after{content:"";position:absolute;top:-30%;bottom:-30%;width:16%;
  background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);
  filter:blur(10px);animation:markShine 15s ease-in-out infinite}
@keyframes markShine{0%{left:-22%}46%{left:106%}100%{left:106%}}

/* 描边：最克制，只剩一条发丝线 */
:host([data-mark-style="outline"]) .mark-word{font-weight:200;letter-spacing:.3em}
:host([data-mark-style="outline"]) .mk-face{background:none;color:transparent;
  -webkit-text-stroke:1px rgba(214,232,255,.5);
  filter:drop-shadow(0 0 28px rgba(120,170,255,.26))}
:host([data-mark-style="outline"]) .mk-ghost,
:host([data-mark-style="outline"]) .mk-shine{display:none}

/* 挤出：原来那套，体积重、转得快，适合深色背景 */
:host([data-mark-style="extrude"]) .mark{mix-blend-mode:screen}
:host([data-mark-style="extrude"]) .mark-inner{transform:rotateY(-28deg) rotateX(8deg);
  animation:markSpin 18s ease-in-out infinite}
@keyframes markSpin{
  0%,100%{transform:rotateY(-28deg) rotateX(8deg) translateZ(0)}
  50%{transform:rotateY(-17deg) rotateX(3deg) translateZ(16px)}
}
:host([data-mark-style="extrude"]) .mark-word{font-weight:800;letter-spacing:-.04em;
  line-height:.86;text-transform:none;
  font-size:calc(clamp(46px,6vw,92px) * var(--mark-scale,1))}
:host([data-mark-style="extrude"]) .mk{display:block}
:host([data-mark-style="extrude"]) .mk-face{
  background:linear-gradient(168deg,#ffffff 0%,#cfe0ff 38%,#86a9e0 70%,#43639b 100%);
  -webkit-background-clip:text;background-clip:text;color:transparent;
  filter:drop-shadow(0 0 38px rgba(126,172,255,.45)) drop-shadow(0 2px 2px rgba(10,18,36,.6))}
:host([data-mark-style="extrude"]) .mk-ghost{display:none}
.mk{position:absolute;inset:0;color:#7ea9e8;opacity:.4;display:none}

.card{position:absolute;left:var(--panel-left,7.5vw);right:var(--panel-right,auto);
  bottom:var(--card-b,6.5vh);z-index:3;display:flex;align-items:stretch;
  padding:12px 0;border-top:1px solid var(--accent-line);border-bottom:1px solid var(--accent-line);
  opacity:0;transform:translateY(14px);transition:opacity 760ms ease,transform 760ms cubic-bezier(.2,.7,.2,1)}
.card.on{opacity:1;transform:none}
.card.gone{opacity:0}
.card .cell{padding:0 22px;border-left:1px solid var(--accent-soft)}
.card .cell:first-child{padding-left:0;border-left:0}
.card .k{display:block;margin-bottom:5px;font-size:9.5px;letter-spacing:.3em;text-transform:uppercase;
  color:var(--accent-dim);white-space:nowrap}
.card .v{font-size:15.5px;letter-spacing:.04em;color:var(--ink);font-variant-numeric:tabular-nums;white-space:nowrap}
.card .v small{margin-left:5px;font-size:11px;color:var(--accent-dim)}

/* ===== 授权页 ===== */
.auth{position:absolute;left:var(--panel-left,7.5vw);right:var(--panel-right,auto);
  bottom:var(--panel-b,15vh);width:min(560px,50vw);z-index:4;
  opacity:0;transform:translateY(12px);transition:opacity 480ms ease,transform 480ms ease}
.auth.on{opacity:1;transform:none}
.auth-head{display:flex;align-items:center;justify-content:space-between;
  padding-bottom:10px;border-bottom:1px solid var(--accent-line);
  font-size:9.5px;letter-spacing:.32em;text-transform:uppercase;color:var(--accent-dim)}
.arow{display:grid;grid-template-columns:24px 44px 1fr auto;align-items:baseline;gap:12px;
  padding:13px 0;border-bottom:1px solid rgba(255,255,255,.045);opacity:.16;
  transition:opacity 360ms ease}
.arow.on{opacity:1}
.arow .idx{font-family:ui-monospace,Consolas,monospace;font-size:10px;letter-spacing:.1em;color:var(--accent-dim)}
.arow .key{font-size:10px;letter-spacing:.24em;color:var(--accent-dim)}
.arow .val{font-size:14.5px;letter-spacing:.03em;color:var(--ink);font-variant-numeric:tabular-nums}
.arow .st{font-size:10.5px;letter-spacing:.16em;color:var(--accent-dim);white-space:nowrap}
.arow.on .st{color:var(--accent)}
.auth-hint{margin-top:18px;font-size:10px;letter-spacing:.26em;color:rgba(223,233,255,.34);
  opacity:0;transition:opacity 800ms ease}
.auth-hint.on{opacity:1;animation:breathe 2.8s ease-in-out infinite}
@keyframes breathe{0%,100%{opacity:.3}50%{opacity:.78}}

.flash{position:absolute;inset:0;z-index:6;pointer-events:none;opacity:0;
  background:radial-gradient(60% 55% at 32% 62%,rgba(255,255,255,.95),transparent 72%)}
.flash.on{animation:flashIn 620ms ease-out}
@keyframes flashIn{0%{opacity:0}16%{opacity:.2}100%{opacity:0}}

.hint{position:absolute;left:0;right:0;bottom:24px;text-align:center;z-index:3;
  font-size:9.5px;letter-spacing:.34em;color:rgba(223,233,255,.2);
  opacity:0;transition:opacity 1000ms ease}
.hint.on{opacity:1}

@media (max-width:760px){
  .text{left:7vw;right:7vw;bottom:23vh;max-width:none}
  .auth{left:7vw;right:7vw;width:auto;bottom:23vh}
  .card{left:7vw;right:7vw;overflow-x:auto}
  .card .cell{padding:0 14px}
  .title{letter-spacing:.12em}
}
@media (prefers-reduced-motion:reduce){
  *{animation-duration:.001ms!important;transition-duration:.001ms!important}
}
`

    /* ============================================================
     * 骨架
     * ========================================================== */

    function markup(text) {
      const letters = Array.from(text.name)
        .map((ch, index) => '<span class="ch" style="transition-delay:' + String(index * 70) + 'ms">' + esc(ch) + '</span>')
        .join('')
      return (
        '<div class="stage">' +
        '<div class="bg"></div>' +
        '<div class="shot" id="shot"></div>' +
        '<div class="stars" id="stars"></div>' +
        '<div class="mark" id="mark"><div class="mark-inner" id="markInner"></div></div>' +
        '<div class="vig"></div>' +
        '<div class="text" id="text">' +
        '<div class="eyebrow" id="eyebrow"><i></i>' +
        esc(text.eyebrow) +
        '</div>' +
        '<div class="rule" id="rule"></div>' +
        '<h1 class="title" id="title">' +
        letters +
        '</h1>' +
        '<div class="line" id="line"><span class="p">&gt;</span><span id="lineText"></span><b class="cur"></b></div>' +
        '<div class="bar" id="bar"><i></i></div>' +
        '</div>' +
        '<div class="card" id="card"></div>' +
        '<div class="auth" id="auth">' +
        '<div class="auth-head"><span>接入确认</span><span>ACCESS&nbsp;GRANT</span></div>' +
        '<div id="authRows"></div>' +
        '<div class="auth-hint" id="authHint">' +
        esc(text.authHint) +
        '</div>' +
        '</div>' +
        '<div class="hint" id="hint">' +
        esc(text.hint) +
        '</div>' +
        '<div class="flash" id="flash"></div>' +
        '</div>'
      )
    }

    const CANCEL = Symbol('star-boot-cancelled')

    function memoryTotal(data) {
      const value = data && data.memories ? Number(data.memories.total) : NaN
      return Number.isFinite(value) ? String(value) : '—'
    }

    function formatMood(mood) {
      if (mood === null || typeof mood !== 'object') return '—'
      const name = typeof mood.emotion === 'string' && mood.emotion !== '' ? mood.emotion : '平静'
      const level = Number(mood.intensity)
      return Number.isFinite(level) && level > 0 ? name + ' ' + String(level) + '/5' : name
    }

    function cardCells(data) {
      const mem = data && data.memories ? Number(data.memories.total) : NaN
      const stress = data ? Number(data.stress) : NaN
      const closest = data && data.closest && data.closest.name ? String(data.closest.name) : '—'
      const mood = data ? formatMood(data.mood) : '—'
      const cell = (key, value, unit) =>
        '<div class="cell"><span class="k">' +
        key +
        '</span><span class="v">' +
        value +
        (unit ? '<small>' + unit + '</small>' : '') +
        '</span></div>'
      return (
        cell('记忆', Number.isFinite(mem) ? String(mem) : '—', '条') +
        cell('心情', mood, '') +
        cell('压力', Number.isFinite(stress) ? String(Math.round(stress)) : '—', '') +
        cell('最在意', closest, '')
      )
    }

    /** 授权页四条：身份 / 记忆 / 关系 / 通道。都给的是她此刻真的有的东西。 */
    function authRows(data, name) {
      const total = memoryTotal(data)
      const core = data && data.memories && data.memories.core !== undefined ? String(data.memories.core) : '—'
      const people = data && Number.isFinite(Number(data.people)) ? String(Number(data.people)) : '—'
      const closest = data && data.closest && data.closest.name ? String(data.closest.name) : '—'
      return [
        ['01', '身份', name, '在位'],
        ['02', '记忆', total + ' 条', '核心 ' + core],
        ['03', '关系', people + ' 人', '最在意 ' + closest],
        ['04', '通道', '本机 · 不回传', '只读'],
      ]
    }

    function authRowsMarkup(data, name) {
      return authRows(data, name)
        .map(
          (row) =>
            '<div class="arow"><i class="idx">' +
            row[0] +
            '</i><span class="key">' +
            row[1] +
            '</span><span class="val">' +
            row[2] +
            '</span><span class="st">' +
            row[3] +
            '</span></div>',
        )
        .join('')
    }

    /**
     * 挂一次片头。
     *
     * 时间线是「可取消的 await 链」而不是一堆 setTimeout：跳过时只要把 cancelled
     * 翻上去，所有等待都会抛 CANCEL，一条路径收尾，不会留下半截动画。
     *
     * @param {object} options - { mode, preview, onDone }
     * @returns {{ dispose: () => void, skip: () => void } | null}
     */
    function mountSplash(options) {
      const settings = readSettings()
      const text = readText()
      const mode = options && options.mode ? options.mode : settings.mode
      if (mode === 'off') return null

      const existing = document.querySelector('.' + HOST_CLASS)
      if (existing !== null) existing.remove()

      const host = document.createElement('div')
      host.className = HOST_CLASS
      host.setAttribute('aria-hidden', 'true')
      if (settings.scheme !== 'star') host.setAttribute('data-scheme', settings.scheme)
      if (settings.font !== 'system') host.setAttribute('data-font', settings.font)
      host.setAttribute('data-mark-style', settings.markStyle)
      // 面板停在哪一角：横向左右、纵向上中下。卡片永远比正文低 9vh，跟着一起走。
      const rightSide = settings.panel.charAt(0) === 'r'
      const band = settings.panel.charAt(1)
      const panelSide = rightSide ? { left: 'auto', right: '7.5vw' } : { left: '7.5vw', right: 'auto' }
      const panelBand =
        band === 't' ? { text: '68vh', card: '59vh' } : band === 'c' ? { text: '45vh', card: '36vh' } : { text: '15vh', card: '6.5vh' }
      // 外观全部落成变量：设置页改的、面板改的、预览带的，走的都是同一条路。
      const look = {
        '--shot-op': String(settings.dim / 100),
        '--shot-scrim': String(settings.scrim / 100),
        '--shot-blur': String(settings.blur) + 'px',
        '--shot-fit': settings.fit,
        '--shot-pos': settings.pos,
        '--title-scale': String(settings.titleScale / 100),
        '--mark-scale': String(settings.markScale / 100),
        '--mark-op': String(settings.markOpacity / 100),
        '--panel-left': panelSide.left,
        '--panel-right': panelSide.right,
        '--panel-b': panelBand.text,
        '--card-b': panelBand.card,
      }
      for (const key of Object.keys(look)) host.style.setProperty(key, look[key])
      if (settings.accent !== '') {
        const accent = accentVars(settings.accent)
        for (const key of Object.keys(accent)) host.style.setProperty(key, accent[key])
      }
      const root = host.attachShadow({ mode: 'open' })

      const style = document.createElement('style')
      style.textContent = CSS
      root.appendChild(style)

      const body = document.createElement('div')
      body.innerHTML = markup(text)
      root.appendChild(body)

      // 图片/视频：走宿主那条同源路由，换成自己的素材也只改服务端。
      // 地址对所有素材是同一个 URL，浏览器会认缓存——换完视频还拿上一张图的元凶就是它。
      // 加一次性参数，每次上屏都当新资源取；本地读盘，这点代价可以忽略。
      const stamp = String(Date.now())
      const assetSrc = ASSET_ROUTE + '?v=' + stamp
      const audioSrc = ASSET_ROUTE + '?slot=audio&v=' + stamp

      const shot = root.getElementById('shot')
      if (settings.blur > 0) shot.classList.add('blurred')
      /** 当前的背景视频节点（如果有）：跟播要用它判断播完没。 */
      let videoEl = null
      const probe = new Image()
      probe.onload = () => {
        const img = document.createElement('img')
        img.src = assetSrc
        img.alt = ''
        shot.appendChild(img)
      }
      probe.onerror = () => {
        // 换成 mp4 时 Image 会失败；直接挂 video，源不对就让浏览器自己决定。
        const video = document.createElement('video')
        video.src = assetSrc
        video.muted = true
        video.autoplay = true
        // 一直循环：短片播完也不会定在最后一帧（那看着就是卡死）。
        // 「播过一遍没有」靠 timeupdate 记下的最远时间判断，不靠 ended。
        video.loop = true
        video.playsInline = true
        video.setAttribute('muted', '')
        video.addEventListener('timeupdate', () => {
          const at = video.currentTime
          if (!Number.isFinite(video.reached) || at > video.reached) video.reached = at
        })
        // 视频比图片亮得多，左侧压得更深，文字才压得住。
        shot.classList.add('is-video')
        shot.appendChild(video)
        videoEl = video
      }
      probe.src = assetSrc

      const ui = {
        stars: root.getElementById('stars'),
        shot: shot,
        text: root.getElementById('text'),
        eyebrow: root.getElementById('eyebrow'),
        rule: root.getElementById('rule'),
        title: Array.from(root.getElementById('title').children),
        line: root.getElementById('line'),
        lineText: root.getElementById('lineText'),
        bar: root.getElementById('bar'),
        card: root.getElementById('card'),
        auth: root.getElementById('auth'),
        authRows: root.getElementById('authRows'),
        authHint: root.getElementById('authHint'),
        hint: root.getElementById('hint'),
        flash: root.getElementById('flash'),
        mark: root.getElementById('mark'),
        markInner: root.getElementById('markInner'),
      }
      ui.stars.innerHTML = starField(76)

      // 右侧那个词：三套气质，节点也按套建。词本身可改，留空就整块不建节点。
      if (text.mark === '' || settings.mark === 'off') {
        ui.mark.style.display = 'none'
      } else if (settings.markStyle === 'extrude') {
        // 经典挤出：十层叠出厚度，正面再压一层渐变。
        const markLayers = []
        for (let depth = 10; depth >= 1; depth -= 1) {
          const opacity = (0.34 - depth * 0.026).toFixed(3)
          markLayers.push(
            '<span class="mark-word mk" style="position:absolute;inset:0;transform:translateZ(-' +
              String(depth * 5) +
              'px);opacity:' +
              opacity +
              '">' +
              esc(text.mark) +
              '</span>',
          )
        }
        ui.markInner.innerHTML =
          markLayers.join('') +
          '<span class="mark-word mk-face">' +
          esc(text.mark) +
          '</span><div class="mk-shine"></div>'
      } else if (settings.markStyle === 'outline') {
        ui.markInner.innerHTML = '<span class="mark-word mk-face">' + esc(text.mark) + '</span>'
      } else {
        // 玻璃：一层柔光垫底 + 一层字的影子 + 一层渐变正面 + 一条很慢的高光。
        ui.markInner.innerHTML =
          '<div class="mk-veil"></div>' +
          '<span class="mark-word mk-ghost" aria-hidden="true">' +
          esc(text.mark) +
          '</span>' +
          '<span class="mark-word mk-face">' +
          esc(text.mark) +
          '</span><div class="mk-shine"></div>'
      }
      // 关掉文字叠加：名字 / 眉标 / 打字行 / 状态卡全部退场，素材自己说话。
      if (settings.overlay === 'off') {
        ui.text.style.display = 'none'
        ui.card.style.display = 'none'
      }

      document.documentElement.appendChild(host)
      if (!options.preview) clearOtherSplash()
      /** 从这一刻开始算「看得见多久」，最短可见时间按它兜底。 */
      const mountedAt = Date.now()

      /* ---- 音效：默认静音；开了才去问宿主有没有配音频，只放一次 ---- */

      let cancelled = false
      let audio = null
      let audioWanted = false

      const stopAudio = () => {
        audioWanted = false
        if (audio === null) return
        try {
          audio.pause()
        } catch (error) {
          /* 已经收走的节点，pause 抛不抛都无所谓 */
        }
        audio = null
      }

      const startAudio = () => {
        if (audio === null || !audioWanted) return
        try {
          audio.currentTime = 0
        } catch (error) {
          /* 还没元数据时不能 seek */
        }
        try {
          const playing = audio.play()
          // 自动播放被拒就安静着——不拿「用户随手一点跳过」去补这一声。
          if (playing !== undefined && typeof playing.catch === 'function') playing.catch(() => {})
        } catch (error) {
          /* 同上 */
        }
      }

      if (settings.sound === 'on') {
        fetch(CONFIG_ROUTE, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => {
            if (cancelled || payload === null || payload.slots === undefined) return
            const slot = payload.slots.audio
            if (slot === undefined || slot === null || slot.usable !== true) return
            audio = document.createElement('audio')
            audio.src = audioSrc
            audio.preload = 'auto'
            audio.volume = Math.min(1, Math.max(0, settings.volume / 100))
            audioWanted = true
            root.appendChild(audio)
            startAudio()
          })
          .catch(() => {})
      }

      // 已经上屏：同一个 task 里把遮盖撤掉，第一帧就是片头，没有中间态。
      try {
        const frame = window[FIRST_FRAME_GLOBAL]
        if (frame && typeof frame.end === 'function') frame.end()
      } catch (error) {
        /* 兜底的 watch 会撤 */
      }

      const K = PACE_SCALE[settings.pace] ?? 1
      let dissolved = false
      let data = null
      let releaseAuth = null
      const timers = new Set()

      const sleep = (ms) =>
        new Promise((resolve, reject) => {
          if (cancelled) {
            reject(CANCEL)
            return
          }
          const timer = window.setTimeout(() => {
            timers.delete(timer)
            if (cancelled) reject(CANCEL)
            else resolve()
          }, Math.max(0, ms))
          timers.add(timer)
        })

      /** 只给「等待」上节奏系数，交互和淡出保持固定手感。 */
      const wait = (ms) => sleep(ms * K)

      /**
       * 兜底：不管走哪条分支，这一屏至少存在 MIN_VISIBLE_MS。
       * 用户自己按 Esc / 点击跳过时不走这里——那是他的选择，不该被拖住。
       */
      const waitMinimum = async () => {
        const left = MIN_VISIBLE_MS - (Date.now() - mountedAt)
        if (left > 0) await sleep(left)
      }

      /**
       * 「素材跟播」：背景是视频时，等它完整播过一遍再进场（最多 15 秒）。
       *
       * 判断「播过一遍」用 timeupdate 记下的最远时间，不看 ended——循环着的视频永不
       * ended，而短片在片头演完前就已经播完一圈，这时应当立刻走，不该再等。
       * 三种「没在播」的情况一律不站桩，否则画面定住、看着就是卡死：
       *   · paused：自动播放被策略拒了；
       *   · currentTime 1.5 秒没动：卡在缓冲。
       */
      const waitAssetEnd = async () => {
        if (settings.hold !== 'on' || videoEl === null) return
        const total = Number(videoEl.duration)
        if (!Number.isFinite(total) || total <= 0) return
        const deadline = Date.now() + HOLD_CAP_MS
        let lastTime = -1
        let stalledAt = 0
        while (Date.now() < deadline) {
          if (cancelled) throw CANCEL
          const reached = Number.isFinite(videoEl.reached) ? Number(videoEl.reached) : videoEl.currentTime
          if (reached >= total - 0.3) return
          if (videoEl.paused) {
            console.info('[dsh-star-boot] 视频没在自动播放，跳过跟播')
            return
          }
          if (videoEl.currentTime === lastTime) {
            if (stalledAt === 0) stalledAt = Date.now()
            if (Date.now() - stalledAt > 1500) {
              console.info('[dsh-star-boot] 视频停住了，跳过跟播')
              return
            }
          } else {
            stalledAt = 0
            lastTime = videoEl.currentTime
          }
          await sleep(120)
        }
      }

      const dissolve = () => {
        if (dissolved) return
        dissolved = true
        if (typeof releaseAuth === 'function') releaseAuth()
        // 音效跟着这一屏走：淡出时不该还在响。
        stopAudio()
        host.classList.add('out')
        window.setTimeout(() => {
          host.remove()
          window.removeEventListener('keydown', onKey, true)
          if (typeof options.onDone === 'function') options.onDone()
        }, FADE_MS)
      }

      const skip = () => {
        if (cancelled) return
        cancelled = true
        for (const timer of timers) window.clearTimeout(timer)
        timers.clear()
        dissolve()
      }

      /** 授权页的「推进」：确认进入，和跳过到同一个地方，但语义不同。 */
      const advance = () => {
        if (cancelled) return
        if (typeof releaseAuth === 'function') releaseAuth()
        dissolve()
      }

      const onKey = (event) => {
        if (event.key === 'Escape') {
          event.preventDefault()
          skip()
          return
        }
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault()
          if (ui.auth.classList.contains('on')) advance()
          else skip()
        }
      }
      window.addEventListener('keydown', onKey, true)
      host.addEventListener('pointerdown', () => {
        if (ui.auth.classList.contains('on')) advance()
        else skip()
      })

      const typeLine = async (text) => {
        ui.line.classList.add('on')
        for (let index = 0; index < text.length; index += 1) {
          ui.lineText.textContent += text[index]
          await wait(26)
        }
      }

      // 数据在路上，动画不等人：拿不到就退化成「简洁」——没有卡，也没有假数字。
      const cardPromise = fetch(CARD_ROUTE, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((payload) => (payload && payload.ok ? payload : null))
        .catch(() => null)

      /** 授权页：字牌一行行亮起来，然后等人点，没人点就自动进。 */
      const authStage = async (payload) => {
        ui.flash.classList.add('on')
        ui.text.classList.add('gone')
        ui.card.classList.add('gone')
        ui.shot.classList.add('dim')
        ui.mark.classList.add('dim')
        await sleep(480)

        ui.authRows.innerHTML = authRowsMarkup(payload, text.name)
        ui.auth.classList.add('on')
        await sleep(360)

        const rows = Array.from(ui.authRows.children)
        for (const row of rows) {
          row.classList.add('on')
          const status = row.querySelector('.st')
          if (status !== null) {
            const was = status.textContent
            status.textContent = '✓ ' + (was || '')
          }
          await wait(280)
        }

        ui.authHint.classList.add('on')
        await Promise.race([
          new Promise((resolve) => {
            releaseAuth = resolve
          }),
          sleep(AUTH_AUTO_MS),
        ])
      }

      const play = async () => {
        const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
        try {
          if (reduce) {
            ui.stars.classList.add('on')
            ui.eyebrow.classList.add('on')
            ui.rule.classList.add('on')
            ui.title.forEach((node) => node.classList.add('on'))
            ui.shot.classList.add('on')
            ui.mark.classList.add('on')
            data = await Promise.race([cardPromise, sleep(400).then(() => null)])
            ui.line.classList.add('on')
            ui.lineText.textContent = data
              ? text.lineOk.replace('{mem}', memoryTotal(data))
              : text.lineNoCard
            await sleep(REDUCE_HOLD_MS)
            await waitMinimum()
            dissolve()
            return
          }

          await wait(120)
          ui.stars.classList.add('on')
          await wait(110)
          ui.eyebrow.classList.add('on')
          await wait(190)
          ui.rule.classList.add('on')
          await wait(150)

          for (const node of ui.title) {
            node.classList.add('on')
            await wait(96)
          }

          await wait(120)
          ui.shot.classList.add('on')
          await wait(140)
          ui.mark.classList.add('on')
          await wait(120)

          // 等一小会儿数据：拿到就报真实数字，拿不到就说实话。
          data = await Promise.race([cardPromise, wait(420).then(() => null)])
          await typeLine(data ? text.lineOk.replace('{mem}', memoryTotal(data)) : text.lineNoCard)

          const wantAuth = settings.auth === 'on' && data !== null

          if (mode === 'card' && data !== null) {
            ui.card.innerHTML = cardCells(data)
            ui.bar.classList.add('on')
            await wait(260)
            ui.card.classList.add('on')
            await wait(360)
            ui.hint.classList.add('on')
            // 后面还有授权页时，状态卡只做引子，不占满那 2 秒。
            await wait(wantAuth ? HOLD_MS * 0.4 : HOLD_MS)
          } else {
            ui.bar.classList.add('on')
            ui.hint.classList.add('on')
            await wait(1100)
          }

          if (wantAuth) {
            ui.hint.classList.remove('on')
            await authStage(data)
          }

          // 视频还在放就再站一会儿——被切掉尾巴的片子看起来就是「没播完」。
          await waitAssetEnd()

          await waitMinimum()
          dissolve()
        } catch (error) {
          if (error !== CANCEL) {
            // 动画半路抛错也不能把人锁在黑屏里——收场永远比把故事讲完重要。
            console.error('[dsh-star-boot] splash failed', error)
            dissolve()
          }
        }
      }

      /**
       * 起跑要卡两帧：首批 class 和元素创建同帧的话，transition 不会跑。
       * 但窗口如果是最小化/后台启动的，rAF 会被节流甚至不触发——那就用定时器兜底，
       * 否则盖着的黑幕要等 12 秒超时才肯走。两个入口只放一个人进来。
       */
      let started = false
      const kick = () => {
        if (started || cancelled) return
        started = true
        void play()
      }
      window.requestAnimationFrame(() => window.requestAnimationFrame(kick))
      window.setTimeout(kick, 500)

      // 最后一道保险：无论如何，开机这一屏不该超过 26 秒。
      // （跟播最多 15 秒，前面那套动画最多 8 秒多，留一点余量。）
      window.setTimeout(dissolve, 26000)

      return {
        dispose() {
          cancelled = true
          for (const timer of timers) window.clearTimeout(timer)
          timers.clear()
          window.removeEventListener('keydown', onKey, true)
          stopAudio()
          host.remove()
        },
        skip,
      }
    }

    /* ============================================================
     * 设置行
     * ========================================================== */

    const ROW_CSS = `
.star-row{display:flex;align-items:flex-start;gap:16px;padding:12px 0;flex-wrap:wrap;
  font-size:13px;line-height:1.55;color:var(--dsw-alias-label-primary,#191919)}
.star-row-main{flex:1;min-width:240px}
.star-row-title{font-size:13px;color:var(--dsw-alias-label-primary,#191919)}
.star-row-desc{margin-top:3px;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.star-row-ctrl{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.star-groups{display:flex;align-items:center;gap:18px;flex-wrap:wrap;width:100%;margin-top:8px}
.star-group{display:flex;align-items:center;gap:8px}
.star-group>span{font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.star-seg{display:inline-flex;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));border-radius:8px;overflow:hidden}
.star-seg button{border:0;background:transparent;color:var(--dsw-alias-label-secondary,#666);font-family:inherit;
  font-size:12.5px;line-height:1.4;padding:4px 11px;cursor:pointer}
.star-seg button+button{border-left:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35))}
.star-seg button:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.star-seg button.on{background:var(--dsw-alias-brand-primary,#4d6bfe);color:#fff}
.star-swatch{display:inline-flex;align-items:center;gap:5px}
.star-swatch i{width:8px;height:8px;border-radius:50%;display:inline-block}
.star-btn{border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));background:transparent;
  color:var(--dsw-alias-label-primary,#191919);font-family:inherit;font-size:12.5px;padding:5px 12px;
  border-radius:8px;cursor:pointer}
.star-btn:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.14))}
.star-btn[disabled]{opacity:.5;cursor:default}
.star-input{flex:1 1 260px;min-width:0;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));
  background:transparent;color:var(--dsw-alias-label-primary,#111);border-radius:8px;padding:5px 10px;font:inherit;font-size:12.5px}
.star-note{margin-top:6px;font-size:12px;color:var(--dsw-alias-label-secondary,#666)}
.star-note.bad{color:var(--dsw-alias-label-error,#d4380d)}
.star-page{display:flex;flex-direction:column;padding:6px 0 28px;font-size:13px;
  color:var(--dsw-alias-label-primary,#191919)}
.star-page-head{font-size:16px;font-weight:500;letter-spacing:.02em;margin-bottom:6px;
  color:var(--dsw-alias-label-primary,#191919)}
.star-page .star-input{flex:1 1 280px}
.star-range{flex:0 1 160px;min-width:110px;accent-color:var(--dsw-alias-brand-primary,#4d6bfe)}
.star-out{min-width:46px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums;
  color:var(--dsw-alias-label-secondary,#666)}
.star-color{width:36px;height:26px;padding:0;border:1px solid var(--dsw-alias-border-l2,rgba(127,127,127,.35));
  border-radius:7px;background:transparent;cursor:pointer}
.star-page h3{margin:22px 0 2px;font-size:10.5px;font-weight:500;letter-spacing:.26em;text-transform:uppercase;
  color:var(--dsw-alias-label-secondary,#666)}
.star-field{display:flex;align-items:center;gap:10px;margin-bottom:6px}
.star-field>span{width:68px;flex:none;font-size:12.5px}
.star-field .star-input{flex:1}

/* ---------- 星图开机 · 设置页（v2：分栏 + 卡片，克制的动效） ---------- */
.sbp{--sb-ease:cubic-bezier(.22,1,.36,1);--sb-ease2:cubic-bezier(.65,0,.35,1);
  --sb-acc:var(--dsw-alias-brand-primary,#4d6bfe);
  --sb-line:var(--dsw-alias-border-l2,rgba(127,127,127,.22));
  --sb-fg:var(--dsw-alias-label-primary,#191919);--sb-fg2:var(--dsw-alias-label-secondary,#6b6b6b);
  --sb-hover:var(--dsw-alias-interactive-bg-hover,rgba(127,127,127,.1));
  --sb-serif:"Noto Serif SC","Source Han Serif SC","Songti SC","STSong","Source Han Serif",Georgia,serif;
  max-width:760px;padding:4px 0 36px;color:var(--sb-fg);font-size:13px;line-height:1.6;
  -webkit-font-smoothing:antialiased;font-feature-settings:"palt" 1;
  animation:sbp-in .6s var(--sb-ease) both}
@keyframes sbp-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
@keyframes sbp-pane{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}

.sbp-hero{position:relative;overflow:hidden;border-radius:16px;padding:26px 28px 22px;
  background:
    radial-gradient(1px 1px at 18% 30%,rgba(255,255,255,.9),transparent 60%),
    radial-gradient(1px 1px at 72% 22%,rgba(255,255,255,.75),transparent 60%),
    radial-gradient(1.4px 1.4px at 86% 64%,rgba(255,255,255,.85),transparent 60%),
    radial-gradient(1px 1px at 40% 78%,rgba(255,255,255,.6),transparent 60%),
    radial-gradient(1px 1px at 58% 46%,rgba(255,255,255,.55),transparent 60%),
    radial-gradient(120% 140% at 100% 0%,rgba(120,150,255,.28),transparent 55%),
    radial-gradient(90% 120% at 0% 100%,rgba(190,160,255,.22),transparent 60%),
    linear-gradient(160deg,#0d1222,#070910 70%);
  color:#eef2ff;box-shadow:0 1px 0 rgba(255,255,255,.06) inset,0 18px 40px -24px rgba(20,30,80,.55)}
.sbp-hero::after{content:"";position:absolute;inset:0;pointer-events:none;border-radius:inherit;
  box-shadow:0 0 0 1px rgba(255,255,255,.07) inset}
.sbp-eyebrow{font-size:10.5px;letter-spacing:.42em;text-transform:uppercase;color:rgba(214,224,255,.62)}
.sbp-title{margin:6px 0 4px;font-family:var(--sb-serif);font-weight:500;font-size:28px;letter-spacing:.18em;
  background:linear-gradient(180deg,#fff,#c9d6ff 90%);-webkit-background-clip:text;background-clip:text;color:transparent}
.sbp-sub{max-width:44ch;font-size:12.5px;color:rgba(220,228,255,.7);letter-spacing:.02em}
.sbp-hero-foot{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:18px}
.sbp-chip{display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 10px;border-radius:999px;
  font-size:11.5px;letter-spacing:.06em;color:rgba(230,236,255,.82);background:rgba(255,255,255,.06);
  box-shadow:0 0 0 1px rgba(255,255,255,.09) inset;font-variant-numeric:tabular-nums}
.sbp-dot{width:6px;height:6px;border-radius:50%;background:#8fe3b0;box-shadow:0 0 8px #8fe3b0}
.sbp-dot.off{background:#8a8fa3;box-shadow:none}
.sbp-play{margin-left:auto;display:inline-flex;align-items:center;gap:8px;height:34px;padding:0 18px;border:0;
  border-radius:999px;cursor:pointer;font:inherit;font-size:12.5px;letter-spacing:.16em;color:#0b0f1d;
  background:linear-gradient(180deg,#fff,#dbe4ff);box-shadow:0 6px 18px -8px rgba(160,180,255,.9);
  transition:transform .35s var(--sb-ease),box-shadow .35s var(--sb-ease)}
.sbp-play:hover{transform:translateY(-1px);box-shadow:0 10px 24px -8px rgba(170,190,255,.95)}
.sbp-play:active{transform:translateY(0) scale(.98)}
.sbp-play i{width:0;height:0;border-left:7px solid currentColor;border-top:4.5px solid transparent;border-bottom:4.5px solid transparent}

.sbp-tabs{position:relative;display:flex;gap:2px;margin:22px 0 14px;border-bottom:1px solid var(--sb-line)}
.sbp-tab{position:relative;border:0;background:transparent;cursor:pointer;font:inherit;font-size:13px;
  letter-spacing:.14em;padding:9px 14px 11px;color:var(--sb-fg2);transition:color .3s var(--sb-ease)}
.sbp-tab:hover{color:var(--sb-fg)}
.sbp-tab.on{color:var(--sb-fg)}
.sbp-tab::after{content:"";position:absolute;left:14px;right:14px;bottom:-1px;height:1.5px;border-radius:2px;
  background:var(--sb-acc);transform:scaleX(0);transform-origin:center;transition:transform .45s var(--sb-ease)}
.sbp-tab.on::after{transform:scaleX(1)}

.sbp-pane{display:none}
.sbp-pane.on{display:block;animation:sbp-pane .45s var(--sb-ease) both}
.sbp-card{border:1px solid var(--sb-line);border-radius:14px;padding:4px 18px;margin-bottom:14px}
.sbp-card-h{display:flex;align-items:baseline;gap:10px;padding:14px 0 6px;font-family:var(--sb-serif);
  font-size:14px;letter-spacing:.12em}
.sbp-card-h small{font-family:inherit;font-size:11.5px;letter-spacing:.04em;color:var(--sb-fg2)}
.sbp-row{display:flex;align-items:center;gap:16px;min-height:46px;padding:8px 0}
.sbp-row+.sbp-row{border-top:1px dashed var(--sb-line)}
.sbp-row.dim{opacity:.45;transition:opacity .3s var(--sb-ease)}
.sbp-lab{flex:0 0 132px;min-width:0}
.sbp-lab b{display:block;font-weight:500;font-size:13px;letter-spacing:.04em}
.sbp-lab em{display:block;font-style:normal;font-size:11.5px;line-height:1.45;color:var(--sb-fg2);margin-top:1px}
.sbp-ctl{flex:1;min-width:0;display:flex;align-items:center;gap:10px;flex-wrap:wrap}

.sbp .star-seg{border-radius:999px;padding:2px;gap:2px;border-color:var(--sb-line)}
.sbp .star-seg button{border-radius:999px;padding:4px 13px;letter-spacing:.06em;
  transition:background-color .3s var(--sb-ease),color .3s var(--sb-ease)}
.sbp .star-seg button+button{border-left:0}
.sbp .star-seg button.on{background:var(--sb-acc);color:#fff}
.sbp .star-btn{border-radius:999px;padding:5px 14px;letter-spacing:.06em;transition:background-color .3s var(--sb-ease)}
.sbp .star-input{border-radius:10px;padding:7px 12px;border-color:var(--sb-line);
  transition:border-color .3s var(--sb-ease),box-shadow .3s var(--sb-ease)}
.sbp .star-input:focus{outline:0;border-color:var(--sb-acc);
  box-shadow:0 0 0 3px color-mix(in srgb,var(--sb-acc) 18%,transparent)}
.sbp .star-range{flex:1 1 200px;max-width:280px}
.sbp .star-out{min-width:44px}
.sbp .star-color{border-radius:50%;width:26px;height:26px;overflow:hidden}
.sbp .star-color::-webkit-color-swatch-wrapper{padding:0}
.sbp .star-color::-webkit-color-swatch{border:0;border-radius:50%}

.sbp-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;padding:6px 0 14px}
.sbp-mode{position:relative;text-align:left;cursor:pointer;font:inherit;color:var(--sb-fg);
  border:1px solid var(--sb-line);background:transparent;border-radius:12px;padding:12px 14px;
  transition:border-color .35s var(--sb-ease),background-color .35s var(--sb-ease),transform .35s var(--sb-ease)}
.sbp-mode:hover{background:var(--sb-hover);transform:translateY(-1px)}
.sbp-mode b{display:block;font-family:var(--sb-serif);font-weight:500;font-size:14px;letter-spacing:.14em}
.sbp-mode span{display:block;margin-top:3px;font-size:11.5px;color:var(--sb-fg2)}
.sbp-mode.on{border-color:var(--sb-acc);background:color-mix(in srgb,var(--sb-acc) 8%,transparent)}
.sbp-mode.on::after{content:"";position:absolute;top:12px;right:12px;width:7px;height:7px;border-radius:50%;
  background:var(--sb-acc);box-shadow:0 0 0 3px color-mix(in srgb,var(--sb-acc) 22%,transparent)}

.sbp-asset{display:flex;flex-direction:column;gap:8px;padding:10px 0 14px}
.sbp-asset+.sbp-asset{border-top:1px dashed var(--sb-line)}
.sbp-asset-h{display:flex;align-items:center;gap:10px}
.sbp-asset-h b{font-weight:500;letter-spacing:.04em}
.sbp-asset-h em{font-style:normal;font-size:11.5px;color:var(--sb-fg2);flex:1;min-width:0;
  overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sbp-asset-r{display:flex;gap:8px;align-items:center}
.sbp-flash{margin:4px 0 10px;padding:8px 12px;border-radius:10px;font-size:12px;background:var(--sb-hover);
  animation:sbp-pane .4s var(--sb-ease) both}
.sbp-foot{margin-top:18px;font-size:11.5px;letter-spacing:.03em;color:var(--sb-fg2);text-align:center}
.sbp-foot code{font-family:ui-monospace,Consolas,monospace;font-size:11px}

@media (max-width:620px){.sbp-modes{grid-template-columns:1fr}.sbp-row{flex-direction:column;align-items:stretch;gap:6px}
  .sbp-lab{flex:none}}
@media (prefers-reduced-motion:reduce){.sbp,.sbp *{animation:none!important;transition:none!important}}
`

    function ensureRowStyle() {
      if (document.getElementById(ROW_STYLE_ID) !== null) return
      const style = document.createElement('style')
      style.id = ROW_STYLE_ID
      style.textContent = ROW_CSS
      document.head.appendChild(style)
    }

    const MODE_LABELS = [
      { id: 'off', label: '关闭' },
      { id: 'simple', label: '简洁' },
      { id: 'card', label: '状态卡' },
    ]
    const SCHEME_LABELS = [
      { id: 'star', label: '星蓝', color: '#a9c9ff' },
      { id: 'warm', label: '暖光', color: '#ffd0a1' },
      { id: 'violet', label: '靛紫', color: '#c6b4ff' },
      { id: 'ice', label: '素白', color: '#e6eefc' },
    ]
    const PACE_LABELS = [
      { id: 'fast', label: '快' },
      { id: 'normal', label: '标准' },
      { id: 'slow', label: '慢' },
    ]
    const AUTH_LABELS = [
      { id: 'on', label: '开' },
      { id: 'off', label: '关' },
    ]
    const MARK_LABELS = [
      { id: 'on', label: '开' },
      { id: 'off', label: '关' },
    ]
    /** 右侧那个词的气质。 */
    const MARK_STYLE_LABELS = [
      { id: 'glass', label: '玻璃' },
      { id: 'outline', label: '描边' },
      { id: 'extrude', label: '挤出' },
    ]
    const OVERLAY_LABELS = [
      { id: 'on', label: '开' },
      { id: 'off', label: '关' },
    ]
    const SOUND_LABELS = [
      { id: 'on', label: '开' },
      { id: 'off', label: '关' },
    ]
    const HOLD_LABELS = [
      { id: 'on', label: '开' },
      { id: 'off', label: '关' },
    ]
    const FONT_LABELS = [
      { id: 'system', label: '默认' },
      { id: 'serif', label: '衬线' },
      { id: 'mono', label: '等宽' },
      { id: 'round', label: '圆体' },
    ]
    const FIT_LABELS = [
      { id: 'cover', label: '铺满' },
      { id: 'contain', label: '完整' },
    ]
    const POS_LABELS = [
      { id: 'center', label: '居中' },
      { id: 'top', label: '上' },
      { id: 'bottom', label: '下' },
      { id: 'left', label: '左' },
      { id: 'right', label: '右' },
      { id: 'left top', label: '左上' },
      { id: 'right top', label: '右上' },
      { id: 'left bottom', label: '左下' },
      { id: 'right bottom', label: '右下' },
    ]
    /** 面板（名字 / 状态卡 / 授权页）的位置：左右 × 上中下。 */
    const PANEL_LABELS = [
      { id: 'lb', label: '左下' },
      { id: 'lc', label: '左中' },
      { id: 'lt', label: '左上' },
      { id: 'rb', label: '右下' },
      { id: 'rc', label: '右中' },
      { id: 'rt', label: '右上' },
    ]

    /** 分段按钮（页面用；行里那份是内联的，互不依赖）。 */
    function segButtons(options, current, onPick) {
      return h(
        'div',
        { className: 'star-seg' },
        options.map((option) =>
          h(
            'button',
            { key: option.id, type: 'button', className: current === option.id ? 'on' : '', onClick: () => onPick(option.id) },
            option.color
              ? h('span', { className: 'star-swatch' }, h('i', { style: { background: option.color } }), option.label)
              : option.label,
          ),
        ),
      )
    }

    /** 页面用的那套状态：读本地设置、拿素材配置、写入、预览。 */
    function useStarBootState() {
      const [state, setState] = React.useState(readSettings)
      const [asset, setAsset] = React.useState('')
      const [audio, setAudio] = React.useState('')
      const [info, setInfo] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [flash, setFlash] = React.useState(null)

      const takeInfo = React.useCallback((payload) => {
        if (payload === null || payload === undefined) return
        setInfo(payload)
        const slots = payload.slots
        if (slots !== undefined) {
          if (slots.bg !== undefined) setAsset(slots.bg.path ?? '')
          if (slots.audio !== undefined) setAudio(slots.audio.path ?? '')
        } else if (payload.asset !== undefined) {
          setAsset(payload.asset ?? '')
        }
      }, [])

      React.useEffect(() => {
        ensureRowStyle()
        fetch(CONFIG_ROUTE, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then(takeInfo)
          .catch(() => {})
      }, [takeInfo])

      const set = React.useCallback((patch) => {
        setState((current) => {
          const next = Object.assign({}, current, patch)
          if (patch.mode !== undefined) {
            writeMode(patch.mode)
            if (patch.mode === 'off') restoreOtherSplash()
            else muteOtherSplash()
          }
          if (patch.scheme !== undefined) writeEnum(SCHEME_KEY, patch.scheme)
          if (patch.pace !== undefined) writeEnum(PACE_KEY, patch.pace)
          if (patch.auth !== undefined) writeEnum(AUTH_KEY, patch.auth)
          if (patch.mark !== undefined) writeEnum(MARK_KEY, patch.mark)
          if (patch.markStyle !== undefined) writeEnum(MARK_STYLE_KEY, patch.markStyle)
          if (patch.markOpacity !== undefined) writeNumber(MARK_OP_KEY, patch.markOpacity)
          if (patch.overlay !== undefined) writeEnum(OVERLAY_KEY, patch.overlay)
          if (patch.sound !== undefined) writeEnum(SOUND_KEY, patch.sound)
          if (patch.hold !== undefined) writeEnum(HOLD_KEY, patch.hold)
          if (patch.font !== undefined) writeEnum(FONT_KEY, patch.font)
          if (patch.fit !== undefined) writeEnum(FIT_KEY, patch.fit)
          if (patch.pos !== undefined) writeEnum(POS_KEY, patch.pos)
          if (patch.panel !== undefined) writeEnum(PANEL_KEY, patch.panel)
          if (patch.dim !== undefined) writeNumber(DIM_KEY, patch.dim)
          if (patch.scrim !== undefined) writeNumber(SCRIM_KEY, patch.scrim)
          if (patch.blur !== undefined) writeNumber(BLUR_KEY, patch.blur)
          if (patch.titleScale !== undefined) writeNumber(TITLE_SCALE_KEY, patch.titleScale)
          if (patch.markScale !== undefined) writeNumber(MARK_SCALE_KEY, patch.markScale)
          if (patch.volume !== undefined) writeNumber(VOLUME_KEY, patch.volume)
          if (patch.accent !== undefined) writeAccent(patch.accent)
          return next
        })
      }, [])

      /** 存素材：一个槽位一次，path 传空串就是恢复默认。 */
      const save = React.useCallback(
        (slot, path) => {
          setBusy(true)
          fetch(CONFIG_ROUTE, {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ slot, path: String(path ?? '') }),
          })
            .then((response) => response.json())
            .then((payload) => {
              takeInfo(payload)
              setFlash(payload.ok === false ? '保存失败：' + String(payload.error ?? '?') : null)
              setBusy(false)
            })
            .catch(() => setBusy(false))
        },
        [takeInfo],
      )

      /** 选文件 = 直接导入：把字节交给宿主，它落盘、写配置，再回最新状态。 */
      const upload = React.useCallback(
        (slot, file) => {
          if (file === null || file === undefined) return
          setBusy(true)
          setFlash('正在导入 ' + String(file.name) + ' …')
          fetch(UPLOAD_ROUTE, {
            method: 'POST',
            headers: {
              'x-star-slot': slot,
              'x-star-name': encodeURIComponent(file.name),
              'content-type': file.type !== '' ? file.type : 'application/octet-stream',
            },
            body: file,
          })
            .then((response) => {
              if (!response.ok) {
                // 404/405 基本只有一个原因：页面刷新换了客户端，主进程还是旧宿主（没重启）。
                const hint =
                  response.status === 404 || response.status === 405 ? '，宿主还是旧版本——要重启 DSH（不是刷新页面）' : ''
                throw new Error('HTTP ' + String(response.status) + hint)
              }
              return response.json()
            })
            .then((payload) => {
              setBusy(false)
              if (payload.ok === false) {
                setFlash('导入失败：' + String(payload.error ?? '?'))
                return
              }
              takeInfo(payload)
              setFlash('已换成 ' + String(file.name))
            })
            .catch((error) => {
              setBusy(false)
              setFlash('导入失败：' + String(error.message))
            })
        },
        [takeInfo],
      )

      const preview = React.useCallback(() => {
        mountSplash({ mode: state.mode === 'off' ? 'card' : state.mode, preview: true })
      }, [state.mode])

      const [text, setTextState] = React.useState(readText)
      const setText = React.useCallback((patch) => {
        setTextState((current) => {
          const next = Object.assign({}, current, patch)
          writeText(next)
          return next
        })
      }, [])
      const resetText = React.useCallback(() => {
        setTextState(readTextFrom({}))
        writeText({})
      }, [])

      const version =
        typeof window[VERSION_GLOBAL] === 'string' && window[VERSION_GLOBAL] !== '' ? window[VERSION_GLOBAL] : null

      return {
        state,
        set,
        asset,
        setAsset,
        audio,
        setAudio,
        info,
        busy,
        flash,
        save,
        upload,
        preview,
        version,
        text,
        setText,
        resetText,
      }
    }

    /** 写回默认文案：先清掉用户的键，再读一次。 */
    function readTextFrom(raw) {
      try {
        window.localStorage.removeItem(TEXT_KEY)
      } catch (error) {
        /* 忽略 */
      }
      return normalizeText(raw)
    }

    const MODE_CARDS = [
      { id: 'off', label: '关闭', desc: '直接进入对话' },
      { id: 'simple', label: '简洁', desc: '星尘 · 名字逐字点亮' },
      { id: 'card', label: '状态卡', desc: '名字 · 状态卡 · 接入确认' },
    ]
    const PAGE_TABS = [
      { id: 'scene', label: '开场' },
      { id: 'look', label: '外观' },
      { id: 'words', label: '文案' },
      { id: 'media', label: '素材' },
    ]

    /**
     * 「设置」左侧导航里的「星图开机」页。
     *
     * 只依赖 `settings.section` 一个槽位。四个分栏：开场 / 外观 / 文案 / 素材。
     * 所有分栏都会构建（只用 CSS 切换显示），这样各控件状态一致、切换无闪烁。
     */
    function StarBootPage() {
      const model = useStarBootState()
      const [tab, setTab] = React.useState('scene')
      const s = model.state

      const row = (key, label, hint, control, dim) =>
        h(
          'div',
          { className: dim ? 'sbp-row dim' : 'sbp-row', key },
          h('div', { className: 'sbp-lab' }, h('b', null, label), hint ? h('em', null, hint) : null),
          h('div', { className: 'sbp-ctl' }, control),
        )

      const seg = (options, patchKey) => segButtons(options, s[patchKey], (id) => model.set({ [patchKey]: id }))

      const slider = (key, min, max, step, unit) => [
        h('input', {
          key: 'r',
          className: 'star-range',
          type: 'range',
          min,
          max,
          step,
          value: s[key],
          onChange: (event) => model.set({ [key]: Number(event.target.value) }),
        }),
        h('output', { key: 'o', className: 'star-out' }, String(s[key]) + (unit ?? '')),
      ]

      const select = (options, key) =>
        h(
          'select',
          { className: 'star-input', style: { flex: '0 1 180px' }, value: s[key], onChange: (event) => model.set({ [key]: event.target.value }) },
          options.map((option) => h('option', { key: option.id, value: option.id }, option.label)),
        )

      const textInput = (key, placeholder) =>
        h('input', {
          className: 'star-input',
          type: 'text',
          spellCheck: false,
          value: model.text[key],
          placeholder,
          onChange: (event) => model.setText({ [key]: event.target.value }),
        })

      const card = (key, title, sub, children) =>
        h(
          'section',
          { className: 'sbp-card', key },
          h('div', { className: 'sbp-card-h' }, title, sub ? h('small', null, sub) : null),
          children,
        )

      const slots = model.info !== null && model.info.slots !== undefined ? model.info.slots : null
      const bgNote =
        slots === null
          ? '读取中…'
          : slots.bg.usable
            ? String(slots.bg.effective)
            : slots.bg.packed
              ? '随包素材' + (slots.bg.reason ? '（' + String(slots.bg.reason) + '）' : '')
              : '不可用'
      const audioNote =
        slots === null
          ? '读取中…'
          : (slots.audio.usable ? String(slots.audio.effective) : '未设置') + (s.sound === 'off' ? ' · 音效已关' : '')

      const assetBlock = (label, slot, value, setValue, placeholder, accept, note) =>
        h(
          'div',
          { className: 'sbp-asset', key: slot },
          h(
            'div',
            { className: 'sbp-asset-h' },
            h('b', null, label),
            h('em', { title: note }, note),
            // 浏览器不给绝对路径，所以选完直接上传给宿主。
            h(
              'label',
              { className: 'star-btn', style: { cursor: 'pointer' } },
              '选择文件…',
              h('input', {
                type: 'file',
                accept,
                style: { display: 'none' },
                onChange: (event) => {
                  const file = event.target.files !== null ? event.target.files[0] : null
                  if (file !== undefined && file !== null) model.upload(slot, file)
                  event.target.value = ''
                },
              }),
            ),
          ),
          h(
            'div',
            { className: 'sbp-asset-r' },
            h('input', {
              className: 'star-input',
              type: 'text',
              spellCheck: false,
              placeholder,
              value,
              onChange: (event) => setValue(event.target.value),
            }),
            h(
              'button',
              { type: 'button', className: 'star-btn', disabled: model.busy, onClick: () => model.save(slot, value) },
              model.busy ? '保存中…' : '保存路径',
            ),
            h(
              'button',
              {
                type: 'button',
                className: 'star-btn',
                disabled: model.busy || value === '',
                onClick: () => {
                  setValue('')
                  model.save(slot, '')
                },
              },
              '恢复默认',
            ),
          ),
        )

      const modeName = (MODE_CARDS.find((item) => item.id === s.mode) || MODE_CARDS[0]).label
      const paceName = (PACE_LABELS.find((item) => item.id === s.pace) || PACE_LABELS[1]).label
      const schemeName = (SCHEME_LABELS.find((item) => item.id === s.scheme) || SCHEME_LABELS[0]).label

      const panes = {
        scene: [
          card(
            'mode',
            '模式',
            '决定开机时演出到哪一步',
            h(
              'div',
              { className: 'sbp-modes' },
              MODE_CARDS.map((item) =>
                h(
                  'button',
                  {
                    key: item.id,
                    type: 'button',
                    className: s.mode === item.id ? 'sbp-mode on' : 'sbp-mode',
                    onClick: () => model.set({ mode: item.id }),
                  },
                  h('b', null, item.label),
                  h('span', null, item.desc),
                ),
              ),
            ),
          ),
          card('flow', '演出', null, [
            row('pace', '节奏', '整段片头的快慢', seg(PACE_LABELS, 'pace')),
            row('auth', '授权页', '「接入确认」逐条点亮', seg(AUTH_LABELS, 'auth')),
            row('overlay', '文字叠加', '名字与说明文字', seg(OVERLAY_LABELS, 'overlay')),
            row('hold', '素材跟播', '视频素材播完再进入', seg(HOLD_LABELS, 'hold')),
          ]),
          card('sound', '声音', null, [
            row('sound', '音效', '素材页里设置音频文件', seg(SOUND_LABELS, 'sound')),
            row('volume', '音量', null, slider('volume', 0, 100, 1, ''), s.sound === 'off'),
          ]),
        ],
        look: [
          card('tone', '色调', null, [
            row('scheme', '配色', null, seg(SCHEME_LABELS, 'scheme')),
            row(
              'accent',
              '主色',
              s.accent !== '' ? s.accent : '跟随配色',
              [
                h('input', {
                  key: 'c',
                  className: 'star-color',
                  type: 'color',
                  value: s.accent !== '' ? s.accent : '#a9c9ff',
                  onChange: (event) => model.set({ accent: event.target.value }),
                }),
                h(
                  'button',
                  { key: 'b', type: 'button', className: 'star-btn', disabled: s.accent === '', onClick: () => model.set({ accent: '' }) },
                  '用配色自带',
                ),
              ],
            ),
          ]),
          card('type', '字', null, [
            row('font', '字体', null, seg(FONT_LABELS, 'font')),
            row('titleScale', '标题大小', null, slider('titleScale', 70, 140, 5, '%')),
            row('panel', '面板位置', '名字 / 状态卡 / 授权页', select(PANEL_LABELS, 'panel')),
          ]),
          card('mark', '立体字', '右侧那个词', [
            row('mark', '显示', null, seg(MARK_LABELS, 'mark')),
            row('markStyle', '样式', null, seg(MARK_STYLE_LABELS, 'markStyle'), s.mark === 'off'),
            row('markScale', '大小', null, slider('markScale', 60, 160, 5, '%'), s.mark === 'off'),
            row('markOpacity', '透明度', null, slider('markOpacity', 0, 100, 1, '%'), s.mark === 'off'),
          ]),
          card('backdrop', '背景', null, [
            row('fit', '适配', null, seg(FIT_LABELS, 'fit')),
            row('pos', '对齐', null, select(POS_LABELS, 'pos')),
            row('dim', '压暗', null, slider('dim', 0, 100, 1, '')),
            row('scrim', '遮罩', null, slider('scrim', 0, 100, 1, '')),
            row('blur', '模糊', null, slider('blur', 0, 20, 0.5, 'px')),
          ]),
        ],
        words: [
          card('text', '文案', '改完即存，下次开机生效', [
            row('name', '名字', '逐字点亮，≤16 字', textInput('name', '片头的名字')),
            row('eyebrow', '眉标', '名字上方的小字', textInput('eyebrow', '名字上方那行小字')),
            row('mark', '立体字', '留空不显示', textInput('mark', '右侧转的那个词')),
            row('lineOk', '接上', '{mem} = 记忆条数', textInput('lineOk', '接上桥接时打的那句')),
            row('lineNoCard', '没接上', null, textInput('lineNoCard', '拿不到数据时打的那句')),
            row('hint', '跳过提示', '留空隐藏', textInput('hint', '底部那行小字')),
            row('authHint', '授权提示', '留空隐藏', textInput('authHint', '授权页底部那行')),
            row('reset', '', null, h('button', { type: 'button', className: 'star-btn', onClick: model.resetText }, '恢复默认文案')),
          ]),
        ],
        media: [
          card('assets', '素材', '选文件即导入；也可填本机绝对路径', [
            assetBlock(
              '背景',
              'bg',
              model.asset,
              model.setAsset,
              '图片 / 视频绝对路径（留空用随包素材）',
              'image/*,video/*',
              bgNote,
            ),
            assetBlock('音效', 'audio', model.audio, model.setAudio, 'mp3 / wav / ogg 绝对路径（留空 = 无声）', 'audio/*', audioNote),
          ]),
        ],
      }

      return h(
        'div',
        { className: 'sbp' },
        h(
          'header',
          { className: 'sbp-hero' },
          h('div', { className: 'sbp-eyebrow' }, 'Star · Boot'),
          h('div', { className: 'sbp-title' }, '星图开机'),
          h('div', { className: 'sbp-sub' }, '启动时的整屏片头。改动即时保存，下次启动生效；预览无需重启。'),
          h(
            'div',
            { className: 'sbp-hero-foot' },
            h('span', { className: 'sbp-chip' }, h('i', { className: s.mode === 'off' ? 'sbp-dot off' : 'sbp-dot' }), modeName),
            h('span', { className: 'sbp-chip' }, schemeName + ' · ' + paceName),
            model.version !== null ? h('span', { className: 'sbp-chip' }, 'v' + model.version) : null,
            h('button', { type: 'button', className: 'sbp-play', onClick: model.preview }, h('i', null), '预览'),
          ),
        ),
        h(
          'nav',
          { className: 'sbp-tabs' },
          PAGE_TABS.map((item) =>
            h(
              'button',
              { key: item.id, type: 'button', className: tab === item.id ? 'sbp-tab on' : 'sbp-tab', onClick: () => setTab(item.id) },
              item.label,
            ),
          ),
        ),
        model.flash !== null ? h('div', { className: 'sbp-flash' }, model.flash) : null,
        PAGE_TABS.map((item) => h('div', { key: item.id, className: tab === item.id ? 'sbp-pane on' : 'sbp-pane' }, panes[item.id])),
        h(
          'div',
          { className: 'sbp-foot' },
          'Esc 或点击跳过片头 · 地址加 ',
          h('code', null, '?star=0'),
          ' 跳过一次 · 独立控制页 ',
          h('code', null, '/dsh-star-boot/panel'),
        ),
      )
    }

    function SettingsRow() {
      const [state, setState] = React.useState(readSettings)
      const [asset, setAsset] = React.useState('')
      const [info, setInfo] = React.useState(null)
      const [busy, setBusy] = React.useState(false)

      React.useEffect(() => {
        ensureRowStyle()
        fetch(CONFIG_ROUTE, { cache: 'no-store' })
          .then((response) => (response.ok ? response.json() : null))
          .then((payload) => {
            if (payload === null) return
            setInfo(payload)
            setAsset(payload.asset ?? '')
          })
          .catch(() => {})
      }, [])

      const set = React.useCallback((patch) => {
        setState((current) => {
          const next = Object.assign({}, current, patch)
          if (patch.mode !== undefined) writeMode(patch.mode)
          if (patch.scheme !== undefined) writeEnum(SCHEME_KEY, patch.scheme)
          if (patch.pace !== undefined) writeEnum(PACE_KEY, patch.pace)
          if (patch.auth !== undefined) writeEnum(AUTH_KEY, patch.auth)
          if (patch.mark !== undefined) writeEnum(MARK_KEY, patch.mark)
          if (patch.overlay !== undefined) writeEnum(OVERLAY_KEY, patch.overlay)
          if (patch.mode !== undefined) {
            if (patch.mode === 'off') restoreOtherSplash()
            else muteOtherSplash()
          }
          return next
        })
      }, [])

      const save = React.useCallback(() => {
        setBusy(true)
        fetch(CONFIG_ROUTE, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ asset }),
        })
          .then((response) => response.json())
          .then((payload) => {
            setInfo(Object.assign({}, payload, { effective: payload.effective ?? null }))
            setBusy(false)
          })
          .catch(() => setBusy(false))
      }, [asset])

      const preview = React.useCallback(() => {
        mountSplash({ mode: state.mode === 'off' ? 'card' : state.mode, preview: true })
      }, [state.mode])

      const version =
        typeof window[VERSION_GLOBAL] === 'string' && window[VERSION_GLOBAL] !== '' ? window[VERSION_GLOBAL] : null

      const seg = (options, current, onPick) =>
        h(
          'div',
          { className: 'star-seg' },
          options.map((option) =>
            h(
              'button',
              { key: option.id, type: 'button', className: current === option.id ? 'on' : '', onClick: () => onPick(option.id) },
              option.color
                ? h(
                    'span',
                    { className: 'star-swatch' },
                    h('i', { style: { background: option.color } }),
                    option.label,
                  )
                : option.label,
            ),
          ),
        )

      return h(
        'div',
        { className: 'star-row' },
        h(
          'div',
          { className: 'star-row-main' },
          h('div', { className: 'star-row-title' }, '星图开机'),
          h(
            'div',
            { className: 'star-row-desc' },
            '启动时整屏播放一段片头：星尘、她的名字、一张状态卡，然后「接入确认」逐条点亮，点击或 Enter 进入。Esc 或点击跳过。',
          ),
          info !== null
            ? h(
                'div',
                { className: info.reason ? 'star-note bad' : 'star-note' },
                info.reason
                  ? '素材不可用（' + String(info.reason) + '），仍在使用随包的 hero.webp'
                  : '素材：' + (info.effective ?? '随包素材'),
              )
            : null,
          version !== null ? h('div', { className: 'star-note' }, '版本 ' + version) : null,
        ),
        h(
          'div',
          { className: 'star-row-ctrl' },
          seg(MODE_LABELS, state.mode, (id) => set({ mode: id })),
          h('button', { type: 'button', className: 'star-btn', onClick: preview }, '预览'),
        ),
        h(
          'div',
          { className: 'star-groups' },
          h('div', { className: 'star-group' }, h('span', null, '配色'), seg(SCHEME_LABELS, state.scheme, (id) => set({ scheme: id }))),
          h('div', { className: 'star-group' }, h('span', null, '节奏'), seg(PACE_LABELS, state.pace, (id) => set({ pace: id }))),
          h('div', { className: 'star-group' }, h('span', null, '授权页'), seg(AUTH_LABELS, state.auth, (id) => set({ auth: id }))),
        ),
        h(
          'div',
          { className: 'star-row-ctrl', style: { width: '100%', marginTop: '2px' } },
          h('input', {
            className: 'star-input',
            type: 'text',
            spellCheck: false,
            placeholder: '本机图片 / 视频绝对路径（留空用随包素材）',
            value: asset,
            onChange: (event) => setAsset(event.target.value),
          }),
          h('button', { type: 'button', className: 'star-btn', disabled: busy, onClick: save }, busy ? '保存中…' : '保存素材'),
        ),
      )
    }

    /* ============================================================
     * 生命周期
     * ========================================================== */

    /**
     * 挂设置行——**这一步绝不能把插件带到沟里**。
     *
     * `ctx.slots.register` 在槽位没有被声明时会抛 SlotOwnershipError，而这个 profile
     * 里 `@deepseek-ai/dsh-client-ui-settings` 是 `enabled: false`，也就是说
     * `settings.general.item` 根本不存在。裸调 register 会让整个客户端条目激活失败，
     * 而 DSH 把「有插件没激活」当成致命错误——启动直接崩，随后还会把 profile 清单
     * 重置回默认值（2026-11-02 21:27 就是这么把 MCP / 预设 / 全部插件弄丢的）。
     *
     * 所以：先试 register；抛了就改成 inject（槽位出现时才登记）；再抛就只留一行警告。
     */
    function mountSettingsRow(ctx) {
      const option = { name: 'settings.general.item', id: 'star-boot', order: 25 }
      // 先走 inject：槽位**存在**时回调才跑，这是 550C 唯一用的方式，也是安全的那个。
      try {
        if (ctx.slots && typeof ctx.slots.inject === 'function') {
          const dispose = ctx.slots.inject('settings.general.item', () => ctx.slots.register(option, SettingsRow))
          if (typeof dispose === 'function' && typeof ctx.effect === 'function') {
            ctx.effect(() => dispose, 'star-boot: settings row')
          }
          return
        }
      } catch (error) {
        /* 落到下面直接登记 */
      }
      try {
        ctx.slots.register(option, SettingsRow)
        return
      } catch (error) {
        /* 槽位没声明 */
      }
      console.warn('[dsh-star-boot] 设置槽位不可用（设置界面可能被禁用），片头照常播放')
    }

    /**
     * 挂「设置」左侧导航里的独立页。
     *
     * 这条比通用行更可靠：`settings.section` 由设置页本身声明，只要设置页还在就存在，
     * 不受「通用」那一段是否被关掉影响。
     */
    function mountSettingsSection(ctx) {
      if (!ctx.slots || typeof ctx.slots.inject !== 'function') return
      const option = { name: 'settings.section', id: 'star-boot', order: 26, label: () => '星图开机' }
      try {
        const dispose = ctx.slots.inject('settings.section', () => ctx.slots.register(option, StarBootPage))
        if (typeof dispose === 'function' && typeof ctx.effect === 'function') {
          ctx.effect(() => dispose, 'star-boot: settings section')
        }
      } catch (error) {
        console.warn('[dsh-star-boot] 设置页没挂上', error)
      }
    }

    function apply(ctx) {
      // 任何一步失败都不许让条目「未激活」——那会让 DSH 启动失败。
      try {
        mountSettingsRow(ctx)
      } catch (error) {
        console.warn('[dsh-star-boot] settings row failed', error)
      }
      try {
        mountSettingsSection(ctx)
      } catch (error) {
        console.warn('[dsh-star-boot] settings section failed', error)
      }

      try {
        ctx.effect(
          () => () => {
            if (boot !== null) boot.dispose()
          },
          'star-boot: splash',
        )
      } catch (error) {
        /* effect 注册不上也不影响已经挂上的片头 */
      }

      // 预览用：设置行里的按钮调它，不必重启。
      window.__starBootPreview = () => mountSplash({ mode: 'card', preview: true })
    }

    // 在模块求值时就挂——这是客户端插件能画的最早时刻。
    // ?star=0 是逃生口：这一次开机跳过片头，不写任何设置。
    let forcedOff = false
    try {
      forcedOff = window.location.search.indexOf('star=0') >= 0
    } catch (error) {
      forcedOff = false
    }
    const bootMode = forcedOff ? 'off' : readMode()
    let boot = null
    try {
      if (bootMode !== 'off') muteOtherSplash()
      boot = mountSplash({ mode: bootMode })
    } catch (error) {
      // 工厂里抛东西同样会让条目失败，所以这里也必须兜住。
      console.error('[dsh-star-boot] splash mount failed', error)
      boot = null
    }

    exports.name = 'star-boot'
    exports.inject = ['slots']
    exports.apply = apply
    exports.__mountSplash = mountSplash
    return module.exports
  },
})
