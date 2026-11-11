/**
 * QQ 授权码 → 营地凭证。
 *
 * 两个营地用的是同一家（腾讯互娱）的登录网关，但入口和参数格式完全不同：
 *   和平 `formal.api.gp.qq.com/user/login`      JSON + 公共参数（缺一个回 -20011）
 *   王者 `ssl.kohsocialapp.qq.com:10001/user/login`  表单 + specialEncodeParam 签名
 *
 * 为什么放在 vendor/qq 而不是各自的 games/ 里：两条链路的前半段（QQ 扫码换 token）
 * 是共用的，把「拿 token 换营地账号」放在一起，日后腾讯换网关只改这一处。
 */
import crypto from 'node:crypto'

const TIMEOUT = 20_000

/* ---------------- 和平精英 ---------------- */

const PUBG_APPID = '1105412664'
const PUBG_LOGIN = 'https://formal.api.gp.qq.com/user/login'

/**
 * 和平营地 QQ 登录。
 * 请求体 = UserLoginScene 场景字段 + NetworkCommonHandler 公共参数。
 */
export async function pubgLoginByQq({ access_token, openid, pay_token = '' }) {
  const body = {
    appId: PUBG_APPID,
    loginType: 'qqconnect',
    autoLogin: 1,
    appOpenid: openid,
    accessToken: access_token,
    payToken: pay_token,
    lastLoginTime: 0,
    lastGetRemarkTime: 0,
    // ---- NetworkCommonHandler 公共参数（每个请求必带）----
    cDeviceId: crypto.randomUUID().replace(/-/g, ''),
    cDeviceMac: '02:00:00:00:00:00',
    cDevicePPI: 480,
    cDeviceScreenWidth: 1080,
    cDeviceScreenHeight: 2400,
    cDeviceModel: 'Pixel 7',
    cDeviceRom: 'android',
    cDeviceMem: 8589934592,
    cDeviceCPU: 'qcom',
    cDeviceSP: 'China Mobile',
    cDeviceNet: 'WIFI',
    cClientVersionCode: 2102091536,
    cClientVersionName: '3.38.3.1625',
    cChannelId: 10003391,
    cGameId: 20004,
    cSystem: 'android',
    cSystemVersionCode: '34',
    cSystemVersionName: '14',
    cStartType: 0,
    gameAppId: 20004,
    cCurrentGameId: 20004,
    platId: 1,
    openId: openid,
    cRand: String(Date.now()) + String(Math.floor(Math.random() * 10000)),
    cPlanId: 0,
    isColdStart: 0,
    isChange: 0
  }

  const res = await fetch(PUBG_LOGIN, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent':
        'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Version/4.0 Chrome/116.0.0.0 Mobile Safari/537.36',
      Origin: 'https://gp.qq.com',
      Referer: 'https://gp.qq.com/'
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(TIMEOUT)
  })

  const text = await res.text().catch(() => '')
  let json = null
  try {
    json = JSON.parse(text || 'null')
  } catch {
    json = null
  }
  if (!json) throw new Error(`和平营地返回的不是 JSON（HTTP ${res.status}）：${text.slice(0, 120)}`)
  if (json.returnCode !== 0 || !json.data?.userId || !json.data?.token) {
    throw new Error(
      `和平营地拒绝了这次 QQ 登录：${json.returnMsg || `returnCode=${json.returnCode}`}`
    )
  }

  const d = json.data
  return {
    userId: String(d.userId || ''),
    token: String(d.token || ''),
    openId: String(d.appOpenid || openid),
    gameOpenId: String(d.appOpenid || openid),
    uin: String(d.uin || ''),
    userName: String(d.userName || ''),
    nickname: String(d.userName || ''),
    avatar: String(d.avatar || ''),
    userSig: String(d.userSig || ''),
    loginPlatform: 'qq'
  }
}

/* ---------------- 王者荣耀 ---------------- */

const KOG_CAMP = 'https://ssl.kohsocialapp.qq.com:10001'

/**
 * 营地 QQ 登录的候选 loginType。
 *
 * 王者营地接口对「不认识的 loginType」和「认识的但凭证无效」回同一个
 * `-30003 登录态失效`（实测 zz/qq/wx_qq/qqlogin 全一样），所以没法靠报错反推
 * 该填哪个。这里按可能性从高到低试，命中即返回。
 */
const KOG_LOGIN_TYPES = ['qq', 'qqconnect']

function kogForm(fields) {
  return new URLSearchParams({
    delOldUser: '0',
    key1: crypto.randomUUID().replace(/-/g, ''),
    lastLoginTime: '0',
    lastGetRemarkTime: '0',
    cChannelId: '10003391',
    cClientVersionCode: '2057957801',
    cClientVersionName: '10.111.0323',
    cCurrentGameId: '20001',
    cGameId: '20001',
    cGzip: '1',
    cIsArm64: 'true',
    cRand: String(Date.now()),
    cSupportArm64: 'true',
    cSystem: 'android',
    cSystemVersionCode: '34',
    cSystemVersionName: '14',
    cpuHardware: 'qcom',
    gameId: '20001',
    tinkerId: '2057957801_64_0',
    ...fields
  })
}

/**
 * 王者营地 QQ 登录。
 *
 * 字段名是 camelCase（openId / accessToken），跟和平那套的 openid / payload 不同，
 * 来自营地 App 抓包（登录请求里就是这两个名字）。
 */
export async function kogLoginByQq({ access_token, openid, pay_token = '', xLogUid = '', specialEncodeParam }) {
  if (typeof specialEncodeParam !== 'string' || !specialEncodeParam) {
    throw new Error('缺少 specialEncodeParam，无法签名')
  }

  let lastError = null
  for (const loginType of KOG_LOGIN_TYPES) {
    const form = kogForm({
      loginType,
      openId: openid,
      accessToken: access_token,
      payToken: pay_token,
      specialEncodeParam
    })

    const res = await fetch(`${KOG_CAMP}/user/login`, {
      method: 'POST',
      headers: {
        'Content-Encrypt': '',
        'Accept-Encrypt': '',
        NOENCRYPT: '1',
        'X-Client-Proto': 'https',
        'User-Agent': 'okhttp/4.9.1',
        'x-log-uid': xLogUid,
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        cChannelId: '10003391',
        cClientVersionCode: '2057957801',
        cClientVersionName: '10.111.0323',
        cCurrentGameId: '20001',
        cGameId: '20001',
        cGzip: '1',
        cIsArm64: 'true',
        cRand: String(Date.now()),
        cSupportArm64: 'true',
        cSystem: 'android',
        cSystemVersionCode: '34',
        cSystemVersionName: '14',
        cpuHardware: 'qcom',
        gameId: '20001',
        tinkerId: '2057957801_64_0',
        specialEncodeParam
      },
      body: form.toString(),
      signal: AbortSignal.timeout(TIMEOUT)
    })

    const text = await res.text().catch(() => '')
    let json = null
    try {
      json = JSON.parse(text)
    } catch {
      json = null
    }

    if (json?.returnCode === 0 && json?.data?.userId && json?.data?.token) {
      return { loginResponse: json, loginType }
    }
    lastError = new Error(
      `王者营地拒绝了这次 QQ 登录（loginType=${loginType}）：${json?.returnMsg || text.slice(0, 120) || `HTTP ${res.status}`}`
    )
  }

  throw lastError || new Error('王者营地 QQ 登录失败')
}
