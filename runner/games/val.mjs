/**
 * 无畏契约适配：掌瓦（app.mval.qq.com）走微信「扫码 SDK」链路。
 *
 * 参数严格对齐上游 `bridge/login/{wxqr,exchange}.js`（MIT，Looking08/Valorant-Plugin）。
 * 掌瓦服务端会校验 mcode / mappid / clienttype / config_params / zone，
 * 少一个就回 `MlolLoginByWechat fail ret=10002`，所以这里一个都不能省。
 *
 * 英雄/地图等元数据走 valorant-api.com，无需登录。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import fetch from '../lib/fetch.mjs'
import { saveAccount, getAccount, writeJson } from '../lib/store.mjs'
import { toDataUrl } from '../lib/dataurl.mjs'
import { createQr, pollQr, resolveToken } from '../vendor/qq/qr.mjs'

export const meta = {
  id: 'val',
  name: '无畏契约',
  upstream: 'https://github.com/Looking08/Valorant-Plugin',
  publicQueries: ['英雄资料', '地图列表'],
  privateQueries: ['个人面板', '最近战绩', '对局详情', '同场玩家', '枪械熟练度', '特工熟练度', '地图熟练度'],
  loginHint: '微信 / QQ 扫码登录掌瓦',
  loginChannels: ['wx', 'qq']
}

const MVAL = 'https://app.mval.qq.com'
const SDK_TICKET_API = `${MVAL}/go/auth/get_sdk_ticket`
const WX_LOGIN = `${MVAL}/go/auth/login_by_wechat`
const ROLE_API = `${MVAL}/go/account/get_main_role_raw`
const QR_CONNECT = 'https://open.weixin.qq.com/connect/sdk/qrconnect'
const QR_POLL = 'https://long.open.weixin.qq.com/connect/l/qrconnect'

/** 掌瓦自己的微信开放平台 appid；换成掌上英雄联盟那个换票必 40029 */
const APPID = 'wxcbb49f1f39656c2a'
/** 缺少 UA 后半段时，部分网关会判「非客户端请求」 */
const UA =
  'mval/2.4.0.10053 Channel/10068 Manufacturer/Xiaomi ' +
  'Mozilla/5.0 (Linux; Android 14; 23117RK66C Build/V417IR; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 ' +
  'Chrome/101.0.4951.61 Mobile Safari/537.36'
const DEVICE = '23117RK66C'
/** APK 里写死的 mcode，缺失时掌瓦回 10002 */
const MCODE = '132f0a77d34402abc8463d60100011d19b0e'
const CLIENTS = { clienttype: 9, mappid: 10200 }
/** 取票/换票都是「未登录」动作，带登录态 cookie 反而被判非法 */
const ANON_COOKIE = 'clientType=9; openid=null; access_token=null'

const sha1 = text => crypto.createHash('sha1').update(text).digest('hex')
const zoneQuery = zone => `?source_game_zone=${zone}&game_zone=${zone}`

/** 服务端偶尔把响应体拼两遍，容错一下 */
function parseEnvelope(text) {
  try {
    return JSON.parse(text)
  } catch {
    const i = String(text).indexOf('}{')
    if (i > 0) {
      try {
        return JSON.parse(String(text).slice(0, i + 1))
      } catch {
        return null
      }
    }
    return null
  }
}

/** 把上游 ret 码翻成人话 */
function explain(json) {
  const detail = String(json?.errMsg || json?.err_msg || json?.msg || '')
  const ret = (detail.match(/ret=(\d+)/) || [])[1] || ''
  const wxCode = (detail.match(/code:(\d+)/) || [])[1] || ''
  if (wxCode === '40029' || ret === '40029') {
    return '微信 code 无效：已用过、已过期，或不是这个 appid 签发的'
  }
  if (ret === '10002') {
    return '掌瓦拒绝了这个请求（ret=10002）：多为 mcode/mappid/clienttype 缺失或过期，也可能该 code 已被消费'
  }
  return json?.msg || detail || '没有说明原因'
}

/* ---------- 1) 取 sdk_ticket ---------- */

async function getSdkTicket(zone = 'agame') {
  const res = await fetch(`${SDK_TICKET_API}${zoneQuery(zone)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Cookie: ANON_COOKIE
    },
    body: JSON.stringify({
      clienttype: CLIENTS.clienttype,
      config_params: { client_dev_name: DEVICE, lang_type: 0 }
    }),
    timeout: 15000
  })
  const json = parseEnvelope(await res.text())
  const ticket = json?.data?.ticket || json?.data?.sdk_ticket || json?.ticket || ''
  if (!ticket) {
    throw new Error(`取掌瓦 sdk_ticket 失败：${JSON.stringify(json || {}).slice(0, 200)}`)
  }
  return String(ticket)
}

/* ---------- 2) 出码 ---------- */

async function getQrCode(ticket) {
  const noncestr = crypto.randomBytes(8).toString('hex')
  const timestamp = String(Math.floor(Date.now() / 1000))
  const signature = sha1(
    `appid=${APPID}&noncestr=${noncestr}&sdk_ticket=${ticket}&timestamp=${timestamp}`
  )
  const url = new URL(QR_CONNECT)
  url.searchParams.set('appid', APPID)
  url.searchParams.set('noncestr', noncestr)
  url.searchParams.set('timestamp', timestamp)
  url.searchParams.set('scope', 'snsapi_userinfo')
  url.searchParams.set('signature', signature)

  const res = await fetch(url.toString(), { timeout: 15000, headers: { 'User-Agent': UA } })
  const json = parseEnvelope(await res.text())
  const base64 = json?.qrcode?.qrcodebase64
  if (json?.errcode !== 0 || !base64 || !json?.uuid) {
    const hint = json?.errcode === 40001 ? '（sdk_ticket 无效或签名串顺序不对）' : ''
    throw new Error(`获取掌瓦登录二维码失败：${JSON.stringify(json || {}).slice(0, 200)}${hint}`)
  }
  return { uuid: json.uuid, base64, appName: json.appname || '掌上无畏契约' }
}

/* ---------- 3) 轮询 ---------- */

async function pollOnce(uuid) {
  const url = `${QR_POLL}?f=json&uuid=${encodeURIComponent(uuid)}&_=${Date.now()}`
  const res = await fetch(url, { timeout: 15000, headers: { 'User-Agent': UA } })
  const text = await res.text()
  const num = key => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*(\\d+)`)) || text.match(new RegExp(`${key}=(\\d+)`))
    return m ? Number(m[1]) : null
  }
  const str = key => {
    const m = text.match(new RegExp(`"${key}"\\s*:\\s*"([^"]*)"`)) || text.match(new RegExp(`${key}=['"]([^'"]*)['"]`))
    return m ? m[1] : ''
  }
  return {
    errcode: num('wx_errcode'),
    code: str('wx_code'),
    raw: String(text).slice(0, 160)
  }
}

/* ---------- 4) code → 掌瓦凭证 ---------- */

async function exchange(code, zone = 'agame') {
  const body = {
    clienttype: CLIENTS.clienttype,
    config_params: { client_dev_name: DEVICE, lang_type: 0 },
    login_info: {
      appid: APPID,
      check_third_type: 1,
      code: String(code),
      wx_info_type: 1
    },
    mappid: CLIENTS.mappid,
    mcode: MCODE
  }

  const res = await fetch(`${WX_LOGIN}${zoneQuery(zone)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Cookie: ANON_COOKIE
    },
    body: JSON.stringify(body),
    timeout: 20000
  })

  const json = parseEnvelope(await res.text())
  if (!json) throw new Error('掌瓦返回的不是 JSON，换凭证失败')
  if (String(json.result) !== '0') {
    throw new Error(`掌瓦换取登录态失败：${explain(json)}（原始返回 ${JSON.stringify(json).slice(0, 300)}）`)
  }

  // 凭证结构是 { user_id, wt, ct, ctt, sk }（见上游 mateapp-scanlogin.md），
  // access_token 只出现在部分版本里 —— 所以不能拿它当「换票是否成功」的判据。
  const data = json.data || {}
  const info = data.login_info || data || {}
  const raw = JSON.stringify(json)

  // 顺手留一份原始响应，字段对不上时不用再扫一次码
  try {
    writeJson('val-login-raw.json', { at: new Date().toISOString(), json })
  } catch {
    /* 落盘失败不影响登录 */
  }

  const pick = keys => {
    for (const src of [info, data]) {
      for (const key of keys) {
        const v = src?.[key]
        // 掌瓦把 openid 脱敏成 "*" 放出来，真值在 third_openid 里 —— 跳过占位符
        if (v && String(v) !== '*') return String(v)
      }
    }
    return ''
  }

  const credential = {
    token: pick(['access_token', 'accessToken', 'token', 'at']),
    openid: pick(['third_openid', 'openid', 'open_id', 'third_userid']),
    wt: pick(['wt', 'wtoken']),
    sk: pick(['sk']),
    ct: pick(['ct']),
    ctt: pick(['ctt']),
    userId: pick(['user_id', 'userId', 'uin']),
    nickname: pick(['nickname', 'user_name', 'role_name']),
    expiresIn: Number(pick(['expires_in', 'expires']) || 0),
    raw
  }

  // 换票成功的判据：拿到任意一个身份字段就行，缺 access_token 不算失败
  if (!credential.userId && !credential.wt && !credential.ctt && !credential.token) {
    throw new Error(`掌瓦换票返回里找不到任何凭证字段：${raw.slice(0, 400)}`)
  }

  return credential
}

/** 拿角色名（顺带验证登录态真的能用）；失败不影响登录成功判定 */
async function fetchRole(cookie) {
  try {
    const res = await fetch(`${ROLE_API}${zoneQuery('codev')}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Cookie: cookie },
      body: JSON.stringify({
        clienttype: CLIENTS.clienttype,
        config_params: { client_dev_name: DEVICE, lang_type: 0 }
      }),
      timeout: 12000
    })
    const json = parseEnvelope(await res.text())
    if (!json || String(json.result) !== '0') return null
    const list = Object.values(json.data?.list || {})
    const role = list.find(r => r.gameId === 'codev') || list[0] || null
    if (!role) return null
    return {
      name: role.role_name || '',
      uid: role.uuid || '',
      roleId: String(role.game_role_id || ''),
      tierText: role.tier_text || '',
      scene: role.scene || '',
      gameId: role.gameId || ''
    }
  } catch {
    return null
  }
}

/**
 * 真实抓包里的 cookie 长这样（bridge/providers/mateapp.example.json）：
 *   clientType=9; appid=10200; acctype=; openid=..; access_token=..; userId=..; accountType=2; tid=..
 * 但「appid 该填微信那个还是第三方 aid」「access_token 该填 token 还是 wt」
 * 各版本说法不一，所以这里生成几种组合，用 get_main_role_raw 实测哪个能认出角色。
 */
function buildCookie({ openid, token, userId, wt, appid = APPID, acctype = 'wx' }) {
  return [
    'clientType=9',
    `appid=${appid}`,
    `acctype=${acctype}`,
    `openid=${openid}`,
    `access_token=${token}`,
    `userId=${userId}`,
    'accountType=5',
    `tid=${wt}`
  ].join('; ')
}

function cookieVariants(cred) {
  const tokens = [...new Set([cred.token, cred.wt, cred.sk].filter(Boolean))].slice(0, 2)
  const appids = [...new Set([APPID, '102061775'])].slice(0, 2)
  const list = []
  for (const token of tokens.length ? tokens : ['']) {
    for (const appid of appids) {
      list.push(
        buildCookie({
          openid: cred.openid,
          token,
          userId: cred.userId,
          wt: cred.wt,
          appid,
          acctype: 'wx'
        })
      )
    }
  }
  return list
}

/* ---------- 对外：登录 ---------- */

/** 渠道规范化：允许 wx / wechat / 微信、qq / QQ */
export function normalizeChannel(channel) {
  const text = String(channel || '').trim().toLowerCase()
  if (['qq', 'q', 'qq扫码'].includes(text)) return 'qq'
  return 'wx'
}

export async function startLogin(options = {}) {
  const channel = normalizeChannel(options.channel)

  if (channel === 'qq') {
    const { session, qrBase64 } = await createQr({ game: 'val' })
    return {
      session: {
        game: 'val',
        channel: 'qq',
        qq: session,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3 * 60 * 1000
      },
      qr: toDataUrl(qrBase64),
      appName: '掌上无畏契约',
      channel: 'qq'
    }
  }

  const ticket = await getSdkTicket()
  const qr = await getQrCode(ticket)
  return {
    session: {
      game: 'val',
      channel: 'wx',
      ticket,
      uuid: qr.uuid,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3 * 60 * 1000,
      scanned: false
    },
    qr: toDataUrl(qr.base64),
    appName: qr.appName,
    channel: 'wx'
  }
}

/* ---------- QQ 通道 ---------- */

const QQ_LOGIN = `${MVAL}/go/auth/login_by_qq`
/** 掌瓦 QQ 开放平台移动应用 appid（扫码时 pt_3rd_aid 用的也是它） */
const QQ_THIRD_AID = '102061775'

/**
 * QQ 的 openid + access_token 换掌瓦凭证。
 *
 * 跟微信那条的区别只在 login_info：微信是 code + check_third_type，
 * QQ 是 openid + sig(access_token) + qq_info_type:5。
 * 返回结构一样是 { user_id, wt, ct, ctt, sk }。
 */
async function exchangeQq(openid, accessToken, zone = 'agame') {
  const body = {
    clienttype: CLIENTS.clienttype,
    config_params: { client_dev_name: DEVICE, lang_type: 0 },
    login_info: {
      appid: Number(QQ_THIRD_AID),
      openid,
      qq_info_type: 5,
      sig: accessToken,
      uin: 0
    },
    mappid: CLIENTS.mappid,
    mcode: MCODE,
    source_game_zone: zone,
    game_zone: zone
  }

  const res = await fetch(`${QQ_LOGIN}${zoneQuery(zone)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Cookie: ANON_COOKIE
    },
    body: JSON.stringify(body),
    timeout: 20000
  })

  const json = parseEnvelope(await res.text())
  if (!json) throw new Error('掌瓦返回的不是 JSON，QQ 换凭证失败')
  if (String(json.result) !== '0') {
    const detail = String(json.errMsg || json.err_msg || json.msg || '')
    const ret = (detail.match(/ret=(\d+)/) || [])[1] || ''
    if (ret === '10104') {
      throw new Error(
        '掌瓦不认这个 QQ 授权（10104）：token 已过期 / 被顶号，或不是掌瓦 appid（102061775）签发的'
      )
    }
    throw new Error(`掌瓦 QQ 换凭证失败：${explain(json)}（原始返回 ${JSON.stringify(json).slice(0, 260)}）`)
  }

  const info = json.data?.login_info || {}
  if (!info.user_id) throw new Error('掌瓦没返回 user_id，QQ 换凭证没成功')

  return {
    token: accessToken,
    openid,
    wt: String(info.wt || ''),
    ct: String(info.ct || ''),
    ctt: String(info.ctt || ''),
    sk: String(info.sk || ''),
    userId: String(info.user_id || ''),
    nickname: String(info.nickname || info.user_name || ''),
    expiresIn: Number(info.expires_in || 0)
  }
}

/** QQ 通道的 cookie：acctype=qc，token 位放 QQ 的 access_token，tid 位放掌瓦的 wt */
function qqCookieOf({ openid, token, userId, wt }) {
  return buildCookie({ openid, token, userId, wt, appid: QQ_THIRD_AID, acctype: 'qc' })
}

async function pollQqLogin(session) {
  const polled = await pollQr(session.qq)
  if (polled.state === 'waiting') return { state: 'pending' }
  if (polled.state === 'scanned') return { state: 'pending', scanned: true }
  if (polled.state === 'expired') return { state: 'expired', message: polled.message }
  if (polled.state !== 'confirmed') return { state: 'error', message: polled.message || 'QQ 扫码失败' }

  let token
  try {
    token = await resolveToken(polled.checkSig, session.qq)
  } catch (error) {
    return { state: 'error', message: error?.message || String(error) }
  }

  let credential
  try {
    credential = await exchangeQq(token.openid, token.access_token)
  } catch (error) {
    return { state: 'error', message: error?.message || String(error) }
  }

  const cookie = qqCookieOf(credential)
  const role = await fetchRole(cookie)

  const account = {
    token: credential.token,
    openid: credential.openid,
    userId: credential.userId,
    wt: credential.wt,
    ct: credential.ct,
    ctt: credential.ctt,
    sk: credential.sk,
    channel: 'qq',
    nickname: role?.name || credential.nickname || '',
    cookie,
    role,
    expiresIn: credential.expiresIn,
    loginPlatform: 'qq'
  }
  saveAccount('val', account, session.userKey)

  if (!role) {
    // 拿到凭证但认不出角色 —— 大概率是这位 QQ 没在掌瓦建过手游角色
    return {
      state: 'success',
      account: { userId: account.userId, nickname: account.nickname },
      warning: '登录成功，但没认出无畏契约角色（这个 QQ 可能还没进过游戏）'
    }
  }

  return { state: 'success', account: { userId: account.userId, nickname: account.nickname } }
}

export async function pollLogin(session) {
  if (session?.channel === 'qq') {
    try {
      return await pollQqLogin(session)
    } catch (error) {
      return { state: 'error', message: error?.message || String(error) }
    }
  }

  let polled
  try {
    polled = await pollOnce(session.uuid)
  } catch {
    // 长轮询超时是常态，当「还没动静」处理，别把会话打死
    return { state: 'pending', scanned: Boolean(session.scanned) }
  }

  const status = polled.errcode
  if (status === 402) return { state: 'expired', message: '二维码已过期，请重新发起' }
  if (status === 403) return { state: 'canceled', message: '已取消登录' }
  if (status === 500) return { state: 'error', message: '微信登录服务异常' }

  if (status === 405) {
    if (!polled.code) return { state: 'pending', scanned: true }
    let credential
    try {
      credential = await exchange(polled.code)
    } catch (error) {
      return { state: 'error', message: error?.message || String(error) }
    }
    const variants = cookieVariants(credential)
    // 并发探测哪套 cookie 能认出角色（等价于「这套凭证真的可用」）
    const probes = await Promise.all(
      variants.map(cookie => fetchRole(cookie).then(role => ({ cookie, role })))
    )
    const hit = probes.find(p => p.role)
    const cookie = hit?.cookie || variants[0]
    const role = hit?.role || null

    const account = {
      token: credential.token,
      openid: credential.openid,
      wt: credential.wt,
      ct: credential.ct,
      ctt: credential.ctt,
      sk: credential.sk,
      userId: credential.userId,
      nickname: role?.name || credential.nickname || '',
      cookie,
      role,
      channel: 'wx',
      loginPlatform: 'wx',
      expiresIn: credential.expiresIn
    }
    saveAccount('val', account, session.userKey)
    return {
      state: 'success',
      account: { userId: account.userId, nickname: account.nickname }
    }
  }

  return { state: 'pending', scanned: status === 404 }
}

/* ---------- 公开元数据（无需登录） ---------- */

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(HERE, '..', 'data')
const META_CACHE = path.join(DATA_DIR, 'val-meta-cache.json')
const META_SNAPSHOT = path.join(DATA_DIR, 'val-meta.json')
const META_TTL = 24 * 60 * 60 * 1000

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

function writeJsonFile(file, data) {
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, JSON.stringify(data))
  } catch {
    // 缓存写不进去不影响结果
  }
}

/* ---------- 随插件发布的图片（media.valorant-api.com 在国内拉不到，只能提前烘好） ---------- */

const ASSET_DIR = path.join(DATA_DIR, 'val-assets')
let assetManifest
function manifestOf() {
  if (assetManifest !== undefined) return assetManifest
  assetManifest = readJsonFile(path.join(ASSET_DIR, 'manifest.json'))
  return assetManifest
}

function bakedFile(kind, uuid) {
  const hit = manifestOf()?.[kind]?.[uuid]
  if (!hit?.file) return ''
  const file = path.join(ASSET_DIR, hit.file)
  return fs.existsSync(file) ? file : ''
}

/**
 * 拉元数据的四级兜底：新鲜缓存 → 网络 → 过期缓存 → 本地快照。
 *
 * 为什么必须这样：valorant-api.com 架在 Cloudflare 上，国内直连经常整段超时，
 * 纯靠网络会让「瓦英雄」「瓦地图」一直报 fetch failed。本地快照是 30 位特工 /
 * 26 张地图的精简表，足够把功能跑通，联网后会自动刷新成最新数据。
 */
async function metaOf(kind, url, pick) {
  const cache = readJsonFile(META_CACHE) || {}
  const hit = cache[kind]
  if (hit?.items?.length && Date.now() - (hit.at || 0) < META_TTL) return hit.items

  try {
    // valorant-api 在 Cloudflare 上，国内时快时慢，给足 20 秒；失败就走缓存/快照
    const res = await fetch(url, { timeout: 20000 })
    const json = await res.json()
    const items = pick(json) || []
    if (items.length) {
      cache[kind] = { at: Date.now(), items }
      writeJsonFile(META_CACHE, cache)
      return items
    }
  } catch {
    // 连不上，走下面的兜底
  }

  if (hit?.items?.length) return hit.items

  const raw = readJsonFile(META_SNAPSHOT)?.[kind] || []
  return raw.map(item =>
    typeof item === 'string'
      ? { name: item, icon: '' }
      : { name: item.name, role: item.role || '', icon: '', desc: '' }
  )
}

export async function agents() {
  const items = await metaOf(
    'agents',
    'https://valorant-api.com/v1/agents?language=zh-CN&isPlayableCharacter=true',
    json =>
      (json?.data || []).map(a => ({
        uuid: a.uuid || '',
        name: a.displayName,
        role: a.role?.displayName || '',
        icon: a.displayIconSmall || a.displayIcon || '',
        desc: a.description || ''
      }))
  )
  // 有本地烘好的头像就用本地文件（运行时不用再赌 media 域名通不通）
  const withIcons = items.map(item => ({
    ...item,
    icon: bakedFile('agents', item.uuid) ? `local:${bakedFile('agents', item.uuid)}` : item.icon
  }))
  return { count: withIcons.length, items: withIcons }
}

export async function maps() {
  const items = await metaOf(
    'maps',
    'https://valorant-api.com/v1/maps?language=zh-CN',
    json =>
      (json?.data || []).map(m => ({
        uuid: m.uuid || '',
        name: m.displayName,
        icon: m.splash || m.listViewIcon || ''
      }))
  )
  const withIcons = items.map(item => ({
    ...item,
    icon: bakedFile('maps', item.uuid) ? `local:${bakedFile('maps', item.uuid)}` : item.icon
  }))
  return { count: withIcons.length, items: withIcons }
}

/* ---------- 需要登录：个人面板 / 最近战绩 ---------- */

const CAREER_ZONE = 'codev'

/** 掌瓦战绩类接口统一入口：POST /go/codev/career/xxx，scene 放在 body 里 */
async function career(path, body, cookie) {
  const res = await fetch(`${MVAL}/go/${CAREER_ZONE}/${path}${zoneQuery(CAREER_ZONE)}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': UA,
      Cookie: cookie
    },
    body: JSON.stringify(body),
    timeout: 15000
  })
  const json = parseEnvelope(await res.text())
  if (!json) throw new Error(`掌瓦 ${path} 返回的不是 JSON`)
  if (String(json.result) !== '0') {
    throw new Error(`掌瓦 ${path} 失败：${explain(json)}`)
  }
  return json.data
}

/** 用存下来的凭证重建 cookie（微信通道实测 access_token 位填 wt 可用） */
function cookieOf(account) {
  if (account?.channel === 'qq') {
    const rebuilt = qqCookieOf(account)
    return rebuilt || account.cookie || ''
  }
  if (!account?.wt) return account?.cookie || ''
  return buildCookie({
    openid: account.openid,
    token: account.wt,
    userId: account.userId,
    wt: account.wt,
    appid: APPID,
    acctype: 'wx'
  })
}

function accountOf(userKey) {
  const account = getAccount('val', userKey)
  if (!account) throw new Error('尚未登录掌瓦，请先扫码登录')
  const scene = account.role?.scene || ''
  if (!scene) throw new Error('凭证里没有战绩 scene，请重新扫码登录')
  return { account, cookie: cookieOf(account), scene }
}

/* ---------- 赛季 / 模式：性能类接口必填 ---------- */

const seasonCache = new Map()
const SEASON_TTL = 6 * 60 * 60 * 1000

/**
 * performance/{gun,agent,map} 只认 season_id + queue_id，缺一个就回
 * `result 1003 Missing required parameters`。
 * 这两个值都藏在 seasonoverview 的 season_list / mode_list 里：
 * season_list 的「生涯(255)」要去掉，最后一项才是当前赛季（序幕八 = 8）；
 * queue_id 用 mode_list 里的竞技模式（101001），不是列表接口的 game_mode_id（101）。
 */
async function seasonOf(account, cookie, scene) {
  const key = account.userId || account.openid || ''
  const hit = seasonCache.get(key)
  if (hit && Date.now() - hit.at < SEASON_TTL) return hit.value

  const ov = await career('career/seasonoverview', { scene, mode: '255', season: '' }, cookie)
  const seasons = (ov?.season_list || []).filter(item => String(item?.key) !== '255')
  const modes = ov?.mode_list || []
  const current = seasons[seasons.length - 1] || {}
  const competitive = modes.find(item => String(item?.title || '').includes('竞技')) || modes[0] || {}

  const value = {
    seasonId: String(current.key || ''),
    seasonName: String(current.title || ''),
    queueId: String(competitive.key || '101001'),
    seasonList: seasons.map(item => ({ title: String(item.title || ''), key: String(item.key || '') })),
    modeList: modes.map(item => ({ title: String(item.title || ''), key: String(item.key || '') }))
  }
  seasonCache.set(key, { at: Date.now(), value })
  return value
}

/* ---------- 枪械 / 特工 / 地图熟练度 ---------- */

/**
 * 掌瓦 gun 接口的 name 字段是空串，只能靠数字 id 自己认。
 * 表来自上游 bridge/providers/mateapp.js 的 WEAPON_MAP（MIT）。
 * 10504 是第 4 把狙击枪，名字未知，保留 id 显示。
 */
export const WEAPON_NAMES = {
  10101: '标配',
  10102: '短炮',
  10103: '狂怒',
  10104: '鬼魅',
  10105: '正义',
  10109: '追猎',
  10201: '蜂刺',
  10202: '骇灵',
  10301: '雄鹿',
  10302: '判官',
  10401: '獠犬',
  10402: '戍卫',
  10403: '幻影',
  10404: '狂徒',
  10405: '悍狼',
  10501: '飞将',
  10502: '冥驹',
  10503: '莽侠',
  10601: '战神',
  10602: '奥丁',
  10701: '近战武器'
}

/** 武器 id 前三位就是类别 */
const WEAPON_CATEGORY = {
  101: '手枪',
  102: '冲锋枪',
  103: '霰弹枪',
  104: '步枪',
  105: '狙击枪',
  106: '机枪',
  107: '近战'
}

/**
 * 枪械熟练度。
 *
 * 上游只给四个数：击杀 / 精准击败率 / 每回合击杀 / 最远击败（米）。
 * 没有总命中、没有总伤害 —— 图片里就只展示这四个，别编。
 */
export async function weapons(userKey) {
  const { account, cookie, scene } = accountOf(userKey)
  const season = await seasonOf(account, cookie, scene)
  const data = await career(
    'career/performance/gun',
    { scene, season_id: season.seasonId, queue_id: season.queueId },
    cookie
  )

  const items = (data?.list || []).map(item => {
    const id = String(item.id || '')
    const kills = Number(item.kill) || 0
    const headRate = Number(item.kill_head) || 0
    return {
      id,
      name: WEAPON_NAMES[id] || `武器 ${id}`,
      category: WEAPON_CATEGORY[id.slice(0, 3)] || '',
      icon: item.image_url || `https://game.gtimg.cn/images/codev/codevzlk2/weapon/${id}.png`,
      kills,
      headshots: Math.round((kills * headRate) / 100),
      headRate,
      killsPerRound: Number(item.kill_round) || 0,
      farthest: Number(item.kill_farthest) || 0
    }
  })

  return {
    nickname: account.nickname || '',
    seasonName: season.seasonName,
    count: items.length,
    items: items.sort((a, b) => b.kills - a.kills)
  }
}

/** 特工熟练度：每个特工的场次 / 胜率 / K/D / 使用时长 */
export async function agentsPerf(userKey) {
  const { account, cookie, scene } = accountOf(userKey)
  const season = await seasonOf(account, cookie, scene)
  const data = await career(
    'career/performance/agent',
    { scene, season_id: season.seasonId, queue_id: season.queueId },
    cookie
  )

  const items = (data?.list || []).map(item => ({
    id: String(item.agent_id || item.id || ''),
    name: item.agent_name || '',
    avatar: item.image_url || '',
    icon: item.icon || '',
    matches: Number(item.part) || 0,
    hours: Math.round((Number(item.time) || 0) / 3600000),
    kd: String(item.kd || ''),
    winRate: String(item.win_rate || '')
  }))

  return {
    nickname: account.nickname || '',
    seasonName: season.seasonName,
    count: items.length,
    items
  }
}

/** 地图熟练度：每张图的胜率 / K/D / 回合得分 + minimap 图 */
export async function mapsPerf(userKey) {
  const { account, cookie, scene } = accountOf(userKey)
  const season = await seasonOf(account, cookie, scene)
  const data = await career(
    'career/performance/map',
    { scene, season_id: season.seasonId, queue_id: season.queueId },
    cookie
  )

  const items = (data?.list || []).map(item => ({
    id: String(item.map_id || ''),
    name: item.name || '',
    icon: item.map_icon || '',
    winRate: String(item.win_rate ?? ''),
    kd: String(item.kd ?? ''),
    roundScore: String(item.round_score ?? ''),
    bestAgent: item.best_hero_url || ''
  }))

  return {
    nickname: account.nickname || '',
    seasonName: season.seasonName,
    count: items.length,
    items
  }
}

function pickText(list, keyword) {
  const hit = (list || []).find(x => String(x?.title || '').includes(keyword))
  return hit?.content || ''
}

/**
 * 对局详情：按序号从战绩列表取 battle_id，再拉记分板。
 * 掌瓦的列表只有摘要（地图名、KDA、评分），记分板才有地图图、十人数据、双方汇总。
 */
export async function matchDetail(userKey, index = 1) {
  const account = getAccount('val', userKey)
  if (!account) throw new Error('尚未登录掌瓦，请先扫码登录')
  const scene = account.role?.scene || ''
  if (!scene) throw new Error('凭证里没有战绩 scene，请重新扫码登录')
  const cookie = cookieOf(account)

  const list = await career('career/record/list', { scene, page: 1, page_size: 10 }, cookie)
  const battles = list?.battle_list || []
  if (!battles.length) throw new Error('最近没有可查的对局')

  const at = Math.min(Math.max(Number(index) || 1, 1), battles.length) - 1
  const battle = battles[at]
  if (!battle?.battle_id) throw new Error('这一局没有对局 ID，换一局试试')

  // 记分板还要 queue_id = 列表里的 game_mode_id（竞技=101），不是 101001
  const board = await career(
    'career/record/scoreboard',
    { scene, battle_id: battle.battle_id, queue_id: String(battle.game_mode_id || '101') },
    cookie
  )
  const detail = board?.detail || {}
  const players = board?.scoreboard || []
  const totals = board?.stats || {}

  const content = String(battle.content || '')
  const mapFromList = content.includes('|') ? content.split('|').pop().trim() : ''
  const myTeam = detail.my_team || ''

  return {
    index: at + 1,
    total: battles.length,
    nickname: account.nickname || '',
    mapName: detail.used_map?.name || mapFromList,
    mapImage: detail.used_map?.icon || '',
    mode: detail.game_mode_name || battle.game_mode || '',
    victory: Number(detail.victory) === 1 || /胜利/.test(String(battle.result_title || '')),
    resultTitle: battle.result_title || (Number(detail.victory) === 1 ? '胜利' : '失败'),
    winScore: detail.winning_games ?? '',
    loseScore: detail.failed_games ?? '',
    duration: detail.duration || '',
    endTime: detail.end_time || battle.time || '',
    myTeam,
    myTeamText: myTeam === 'Blue' ? '蓝方' : myTeam === 'Red' ? '红方' : '',
    enemyTeamText: myTeam === 'Blue' ? '红方' : myTeam === 'Red' ? '蓝方' : '对方',
    level: detail.score_level?.level || '',
    levelTitle: detail.score_level?.title || '',
    myRank: detail.rank ?? '',
    myKda: battle.kda || '',
    myScore: battle.score || '',
    players: players.map(p => ({
      name: p.user_name || '',
      agent: p.used_agent?.name || '',
      agentIcon: p.used_agent?.avatar || p.used_agent?.icon || '',
      kda: p.kda || '',
      score: p.score || '',
      tier: p.tier_name || '',
      team: p.team || '',
      isMe: Number(p.is_me) === 1,
      kills: p.kill ?? '',
      deaths: p.death ?? '',
      assists: p.assist ?? '',
      damage: p.damage ?? '',
      headshotRate: p.head_shots_rate || '',
      firstKill: p.first_kill_count ?? '',
      level: p.score_level?.level || '',
      achievements: (p.achievement || []).map(a => a.desc).filter(Boolean)
    })),
    totals: {
      ourKills: totals.ourTotalKills ?? '',
      theirKills: totals.enemyTotalKills ?? '',
      ourDamage: totals.ourTotalDamage ?? '',
      theirDamage: totals.enemyTotalDamage ?? ''
    }
  }
}

/** 单局记分板（原版「战绩详情」用的就是这条接口） */
export async function scoreboard(userKey, battleId) {
  const account = getAccount('val', userKey)
  if (!account) throw new Error('尚未登录掌瓦，请先扫码登录')
  const scene = account.role?.scene || ''
  if (!scene) throw new Error('凭证里没有战绩 scene，请重新扫码登录')
  const cookie = cookieOf(account)
  return career('career/record/scoreboard', { scene, battle_id: String(battleId) }, cookie)
}

export async function panel(userKey) {
  const account = getAccount('val', userKey)
  if (!account) throw new Error('尚未登录掌瓦，请先扫码登录')
  const scene = account.role?.scene || ''
  if (!scene) throw new Error('凭证里没有战绩 scene，请重新扫码登录')
  const cookie = cookieOf(account)
  const [overview, stat, recent] = await Promise.all([
    career('career/seasonoverview', { scene }, cookie).catch(() => null),
    career('career/record/statdata', { scene }, cookie).catch(() => null),
    career('career/record/list', { scene, page: 1, page_size: 10 }, cookie).catch(() => null)
  ])

  // 赛季概览：data.list[0].body.first_list = [{title:"当前段位",content:"钻石II"}, ...]
  const overviewBody = overview?.list?.[0]?.body || {}
  const tier = pickText(overviewBody.first_list, '当前段位')
  const peak = pickText(overviewBody.first_list, '赛季最高')

  // 统计：data 是数组，第一块是「我的数据」
  const block = Array.isArray(stat) ? stat[0] : stat
  const metrics = {}
  for (const item of block?.data?.list || []) {
    if (item?.title) metrics[item.title] = item.content ?? item.session ?? ''
  }
  const winRate =
    (block?.data?.progress_list || []).find(x => String(x?.title || '').includes('胜率'))?.progress || ''

  const battles = (recent?.battle_list || []).map(b => ({
    时间: b.time || '',
    结果: b.result_title || '',
    特工: b.hero_name || '',
    对局: b.content || '',
    KDA: b.kda || '',
    ACS: b.score || '',
    头像: b.image_url || '',
    对局ID: b.battle_id || ''
  }))

  return {
    nickname: account.nickname || account.role?.name || '',
    tier,
    peak,
    total: block?.data?.session || '',
    winRate,
    acs: metrics.ACS || '',
    kd: metrics['K/D'] || metrics.KD || '',
    headshot: metrics['爆头率'] || '',
    count: battles.length,
    items: battles
  }
}
