/**
 * QQ 互联扫码登录（纯 HTTP，三款游戏共用）。
 *
 * 链路：xlogin（拿 pt_login_sig / qrsig 的前置 cookie）
 *      → ptqrshow（出码，s=8 才有 296×296）
 *      → ptqrlogin（轮询 ptuiCB：66 未扫 / 67 待确认 / 0 成功 / 65 失效）
 *      → check_sig（追 302，落到 auth://tauth.qq.com/#access_token=…&openid=…）
 *
 * ## 为什么自己写而不是抄一份
 *
 * 宿主是「一次动作一个进程」，session 必须能 JSON 落盘再取回来轮询，所以状态
 * 全部摊平成 { cookies, qrsig, ptqrtoken }，不持有任何对象引用。
 *
 * ## 三个实测结论（2026-11 验证）
 *
 * 1. `ptqrshow` **不校验** pt_3rd_aid：随便填也回一张 PNG。真正的差别在授权环节
 *    —— openid 是按 pt_3rd_aid 签发的。所以各游戏必须填自己的那个值，
 *    填错不会报错，只会在最后一步「营地/掌瓦不认这个 openid」时暴露。
 * 2. `s=8` 才有能扫的大码；不传只有 99×99，手机举半天没反应。
 * 3. `ptlogin4.openmobile.qq.com` / `ptlogin4.graph.qq.com` / `ptlogin4.web.qq.com`
 *    被解析到 0.0.0.1（不是网络问题，换 IP 没用）。扫码确认成功后跟着官方 302
 *    换 token 必然断，所以这里把同一段 path/query 换到还活着的主机重试
 *    （ptlogin4.qq.com 上的 check_sig 仍由 `Tencent Login Server/2.0.0` 提供服务）。
 */

const UA =
  'mval/2.4.0.10053 Channel/10068 Manufacturer/Xiaomi ' +
  'Mozilla/5.0 (Linux; Android 14; 23117RK66C Build/V417IR; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 ' +
  'Chrome/101.0.4951.61 Mobile Safari/537.36'

const TIMEOUT = 15_000

/** QQ 互联的通用网页 appid，三个游戏都用它出码 */
const AID = '716027609'
const DAID = '381'
/** 授权回跳：令牌直接挂在 auth:// 的 fragment 上 */
const REDIRECT_URI = 'auth://tauth.qq.com/'
const CONNECT_URL = 'http://connect.qq.com'
const SDKV = '3.5.17.lite'

/**
 * 各游戏的 pt_3rd_aid（QQ 开放平台移动应用 id）。
 * val / pubg 来自各自上游抓包，kog 用王者荣耀的 MSDK appid。
 */
export const QQ_APPS = {
  val: { thirdAid: '102061775', name: '掌上无畏契约' },
  pubg: { thirdAid: '1105412664', name: '和平营地' },
  kog: { thirdAid: '1104466820', name: '王者营地' }
}

/** 已被 DNS 黑洞的换票前置机 */
const BLACKHOLE = new Set(['ptlogin4.openmobile.qq.com', 'ptlogin4.graph.qq.com', 'ptlogin4.web.qq.com'])
/** 候选替换主机（path / query 保持不变，只换 hostname） */
const FALLBACK_HOSTS = ['ptlogin4.qq.com', 'ptlogin2.qq.com', 'ssl.ptlogin2.qq.com']

/** 腾讯的 hash33：ptqrtoken = hash33(qrsig) */
function hash33(input) {
  let hash = 0
  const text = String(input || '')
  for (let i = 0; i < text.length; i += 1) hash += (hash << 5) + text.charCodeAt(i)
  return hash & 0x7fffffff
}

function decodeLayers(raw) {
  let text = String(raw || '')
  for (let i = 0; i < 3 && /%[0-9a-f]{2}/i.test(text); i += 1) {
    try {
      text = decodeURIComponent(text)
    } catch {
      break
    }
  }
  return text
}

/** 从 auth://… 或 …#access_token=… 里抠出 token */
function pickToken(raw) {
  const text = decodeLayers(raw)
  const hashAt = text.indexOf('#')
  const query = hashAt >= 0 ? text.slice(hashAt + 1) : text
  const out = {}
  try {
    for (const [k, v] of new URLSearchParams(query.replace(/^&/, ''))) if (v) out[k] = v
  } catch {
    return null
  }
  if (!out.access_token) return null
  return {
    openid: out.openid || '',
    access_token: out.access_token,
    pay_token: out.pay_token || ''
  }
}

function cookieHeader(cookies) {
  return Object.entries(cookies || {})
    .map(([k, v]) => `${k}=${v}`)
    .join('; ')
}

function absorb(cookies, setCookie) {
  for (const line of setCookie || []) {
    const [pair] = String(line).split(';')
    const at = pair.indexOf('=')
    if (at > 0) cookies[pair.slice(0, at).trim()] = pair.slice(at + 1).trim()
  }
}

/**
 * 出码。
 *
 * ⚠️ 参数不能简化。第一版图省事，xlogin 只带了 `style=33 / hide_title_bar`，
 * 把 `s_url` 指到 `https://graph.qq.com/oauth2.0/login_jump` ——
 * 结果是：二维码正常、手机也能扫上、点确认之后落到 login_jump，
 * 而那个地址没有 `client_id`，直接回 **110401「请求的应用不存在」**。
 *
 * 正确做法是走「移动应用授权」（m_authorize）那一套：
 * `redirect_uri=auth://tauth.qq.com/` + `response_type=token` + `client_id=<pt_3rd_aid>`，
 * 确认后 QQ 会把 access_token 直接塞在 `auth://tauth.qq.com/#...` 里回调。
 *
 * @param {{ game?: string, thirdAid?: string }} options
 */
export async function createQr({ game = 'val', thirdAid = '' } = {}) {
  const aid = thirdAid || QQ_APPS[game]?.thirdAid
  if (!aid) throw new Error(`没有 ${game} 对应的 QQ appid，无法出码`)

  const cookies = {}
  const xl = new URLSearchParams({
    pt_enable_pwd: '1',
    appid: AID,
    pt_3rd_aid: aid,
    daid: DAID,
    pt_skey_valid: '0',
    style: '35',
    force_qr: '1',
    autorefresh: '1',
    s_url: CONNECT_URL,
    refer_cgi: 'm_authorize',
    ucheck: '1',
    fall_to_wv: '1',
    status_os: '12',
    redirect_uri: REDIRECT_URI,
    client_id: aid,
    response_type: 'token',
    scope: 'all',
    sdkp: 'a',
    sdkv: SDKV,
    switch: '1',
    time: String(Math.floor(Date.now() / 1000)),
    show_download_ui: 'true',
    loginty: '6'
  })
  const loginUrl = `https://xui.ptlogin2.qq.com/cgi-bin/xlogin?${xl}`

  const boot = await fetch(loginUrl, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml,*/*;q=0.8', Referer: 'https://openmobile.qq.com/' },
    signal: AbortSignal.timeout(TIMEOUT)
  })
  absorb(cookies, boot.headers.getSetCookie?.())
  const bootHtml = await boot.text().catch(() => '')

  // jsver 是腾讯前端版本号，隔几周换一次；现抓不到才用兜底值
  const jsver =
    (bootHtml.match(/\/monorepo\/([0-9A-Za-z]+)\/ptlogin\/js\//) || [])[1] ||
    (bootHtml.match(/jsver\s*[:=]\s*['"]([0-9a-zA-Z]+)['"]/) || [])[1] ||
    '3ea7b82c'
  // pt_openlogin_data.tid 要的是这次登录会话的标识。
  // 新版 xlogin 不再下发 `idt`，改发 `ptui_identifier`（同样是 000D03… 这种串），
  // 两个都取不到才退化成时间戳。
  const idt = cookies.idt || cookies.ptui_identifier || String(Math.floor(Date.now() / 1000))

  const qr = new URLSearchParams({
    s: '8',
    e: '0',
    appid: AID,
    type: '0',
    t: String(Math.random()),
    u1: CONNECT_URL,
    daid: DAID,
    pt_3rd_aid: aid
  })

  const res = await fetch(`https://xui.ptlogin2.qq.com/ssl/ptqrshow?${qr}`, {
    headers: {
      'User-Agent': UA,
      Accept: 'image/*',
      Referer: loginUrl,
      Cookie: cookieHeader(cookies),
      'X-Requested-With': 'com.tencent.apps.valorant'
    },
    signal: AbortSignal.timeout(TIMEOUT)
  })
  if (!res.ok) throw new Error(`QQ 出码失败（HTTP ${res.status}）`)
  absorb(cookies, res.headers.getSetCookie?.())

  const buffer = Buffer.from(await res.arrayBuffer())
  const isPng = buffer.slice(0, 4).toString('hex') === '89504e47'
  if (!isPng || buffer.length < 200) throw new Error('QQ 出码接口没返回图片，稍后再试')

  const qrsig = cookies.qrsig || ''
  if (!qrsig) throw new Error('QQ 出码没拿到 qrsig，无法轮询')

  return {
    session: {
      appid: AID,
      daid: DAID,
      thirdAid: aid,
      u1: CONNECT_URL,
      cookies,
      qrsig,
      ptqrtoken: String(hash33(qrsig)),
      idt,
      jsver,
      loginUrl,
      createdAt: Date.now()
    },
    qrBase64: buffer.toString('base64')
  }
}

/**
 * 轮询时除了 ptqrtoken，还要带一坨「我是谁、要什么权限」。
 * 缺了 pt_openlogin_data，ptqrlogin 会把会话当无效（返回空 body）。
 */
function openLoginData(session) {
  return new URLSearchParams({
    which: '',
    refer_cgi: 'm_authorize',
    response_type: 'token',
    client_id: session.thirdAid || '',
    state: '',
    display: '',
    openapi: '1011',
    switch: '1',
    src: '1',
    sdkv: SDKV,
    sdkp: 'a',
    tid: session.idt || '',
    pf: 'openmobile_android',
    need_pay: '0',
    browser: '0',
    browser_error: '',
    serial: '',
    token_key: '',
    redirect_uri: REDIRECT_URI,
    page_type: '1',
    has_auth: '1',
    update_auth: '1',
    auth_time: String(Date.now()),
    loginfrom: '',
    loginty: '6'
  }).toString()
}

/** 轮询一次。state: waiting（未扫）/ scanned（已扫待确认）/ confirmed / expired / canceled */
export async function pollQr(session) {
  const params = new URLSearchParams({
    u1: session.u1 || CONNECT_URL,
    from_ui: '1',
    type: '1',
    ptlang: '2052',
    ptqrtoken: session.ptqrtoken,
    daid: session.daid || DAID,
    aid: session.appid || AID,
    pt_openlogin_data: openLoginData(session),
    device: '2',
    ptopt: '1',
    pt_uistyle: '35',
    jsver: session.jsver || '3ea7b82c',
    r: String(Math.random())
  })
  if (session.thirdAid) params.set('pt_3rd_aid', session.thirdAid)
  const loginSig = session.cookies?.pt_login_sig
  if (loginSig) params.set('login_sig', loginSig)

  const res = await fetch(`https://xui.ptlogin2.qq.com/ssl/ptqrlogin?${params}`, {
    headers: {
      // 官方客户端轮询时 UA 后面带这一截，少了会被判非本客户端
      'User-Agent': `${UA} tencent_game_emulator`,
      Accept: '*/*',
      Referer: session.loginUrl || 'https://xui.ptlogin2.qq.com/',
      Cookie: cookieHeader(session.cookies),
      'X-Requested-With': 'com.tencent.apps.valorant'
    },
    signal: AbortSignal.timeout(TIMEOUT)
  })
  let text = ''
  try {
    text = await res.text()
  } catch {
    // 读不出来就当「还没动静」，下一轮再试
  }
  absorb(session.cookies, res.headers.getSetCookie?.())

  // 形如：ptuiCB('66','0','','0','二维码未失效。', '')
  const fields = [...String(text).matchAll(/'([^']*)'/g)].map(m => m[1])
  if (!fields.length) return { state: 'waiting', raw: String(text).slice(0, 120) }

  const [code, , url, , message] = fields
  if (code === '66') return { state: 'waiting' }
  if (code === '67') return { state: 'scanned', message: message || '已扫码，请在手机上确认' }
  if (code === '65') return { state: 'expired', message: message || '二维码已失效，请重新发起' }
  if (code === '0') return { state: 'confirmed', checkSig: url, message: message || '扫码成功' }
  if (code === '100044') return { state: 'error', message: '应用签名校验不通过（100044），这个 appid 不接受网页扫码' }
  return { state: 'error', message: message || `扫码失败（code=${code}）` }
}

/** 跟一段 302，直到拿到 auth:// 里的 token */
async function followHops(startUrl, referer, session, trace) {
  let url = decodeLayers(startUrl).trim()
  const seen = new Set()

  for (let hop = 0; hop < 6; hop += 1) {
    if (!url || seen.has(url)) break
    seen.add(url)

    const now = pickToken(url)
    if (now) return now

    let res
    try {
      res = await fetch(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(TIMEOUT),
        headers: {
          'User-Agent': UA,
          Accept: '*/*',
          Referer: referer,
          'X-Requested-With': 'com.tencent.apps.valorant',
          ...(cookieHeader(session.cookies) ? { Cookie: cookieHeader(session.cookies) } : {})
        }
      })
    } catch (error) {
      // 0.0.0.1 / NXDOMAIN 会在这里炸
      let host = url
      try {
        host = new URL(url).hostname
      } catch {}
      trace.push(`${host}: ${error.cause?.code || error.message}`)
      break
    }
    absorb(session.cookies, res.headers.getSetCookie?.())

    const location = res.headers.get('location') || ''
    if (location) {
      url = /^https?:/.test(location) || location.startsWith('auth://') ? location : new URL(location, url).toString()
      continue
    }

    const body = await res.text().catch(() => '')
    const fromBody = pickToken(body)
    if (fromBody) return fromBody

    // QQ 的错误页会明说原因，别把它当「没跳转」吞掉
    if (/110401|请求的应用/.test(body)) {
      trace.push('QQ 回 110401「请求的应用不存在」')
      break
    }
    if (/110403|redirect_uri/.test(body) && /error/.test(body)) {
      trace.push('QQ 回 110403：redirect_uri 与登记的不一致')
      break
    }

    const next =
      (body.match(/(https?:\/\/[^\s"'<>]*check_sig[^\s"'<>]*)/i) || [])[1] ||
      (body.match(/location\.href\s*=\s*['"]([^'"]+)['"]/i) || [])[1]
    if (next && next !== url) {
      url = decodeLayers(next)
      continue
    }
    break
  }
  return null
}

/**
 * 用 check_sig 换 access_token / openid。
 * 官方给的落点主机被黑洞时，换成候选主机再试；全失败就把 trace 交回去。
 */
export async function resolveToken(checkSig, session) {
  const raw = decodeLayers(checkSig).trim()
  if (!raw) throw new Error('QQ 没给换票地址')

  // check_sig 有可能直接就是 auth:// 回调
  const direct = pickToken(raw)
  if (direct) return direct

  let parsed
  try {
    parsed = new URL(raw)
  } catch {
    throw new Error('QQ 给的换票地址不是合法 URL')
  }

  const candidates = []
  if (!BLACKHOLE.has(parsed.hostname)) candidates.push(raw)
  for (const host of FALLBACK_HOSTS) {
    try {
      const copy = new URL(raw)
      copy.hostname = host
      candidates.push(copy.toString())
    } catch {}
  }

  const trace = []
  for (const url of [...new Set(candidates)]) {
    let host = url
    try {
      host = new URL(url).hostname
    } catch {}
    const token = await followHops(url, 'https://xui.ptlogin2.qq.com/', session, trace)
    if (token) return token
    trace.push(`${host}: 没拿到 token`)
  }

  const joined = trace.slice(-4).join('；')
  const rejected = trace.some(t => t.includes('110401') || t.includes('110403'))
  const error = new Error(
    rejected
      ? `扫码成功，但 QQ 拒绝了这个应用：${joined}。多半是 appid（pt_3rd_aid）与游戏对不上。`
      : `扫码成功但 QQ 没交出 access_token。换票前置机被 DNS 黑洞，已尝试：${joined}`
  )
  error.code = rejected ? 'APP_REJECTED' : 'TOKEN_BLACKHOLE'
  throw error
}
