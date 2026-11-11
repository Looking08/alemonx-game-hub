/**
 * 和平精英适配：扫码登录复用上游 PUBG-Helper-Plugin（木兰宽松许可证 v2）的
 * wxQrLogin.js；查询接口严格照上游 utils/api.js 的契约走
 * `POST formal.api.gp.qq.com` + form-urlencoded。
 *
 * 注意：这些接口**不是** GET 查询串，而是 POST 表单，并且必须带
 * openId / gameOpenId / userId / token / seasonId + gameId 等固定参数，
 * 少一个就回 `returnCode: -30003 登录态失效`。
 */
import { createWxLoginSession, waitForWxLogin } from '../vendor/pubg/wxQrLogin.js'
import { saveAccount, getAccount } from '../lib/store.mjs'
import { toDataUrl } from '../lib/dataurl.mjs'
import { createQr, pollQr, resolveToken } from '../vendor/qq/qr.mjs'
import { pubgLoginByQq } from '../vendor/qq/camp.mjs'
import fetch from '../lib/fetch.mjs'

export const meta = {
  id: 'pubg',
  name: '和平精英',
  upstream: 'https://github.com/TciFurh/PUBG-Helper-Plugin',
  publicQueries: [],
  privateQueries: ['角色卡', '最近战绩', '对局详情', '枪械熟练度', '王牌印记', '周报'],
  loginHint: '微信 / QQ 扫码登录和平营地',
  loginChannels: ['wx', 'qq']
}

const BASE = 'https://formal.api.gp.qq.com'
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; ONEPLUS A6000) AppleWebKit/537.36'
}
/** 上游写死的公共参数，20004 是和平精英的游戏 ID */
const COMMON = { roleId: '0', count: '5', gameId: '20004', cGameId: '20004', cCurrentGameId: '20004' }

/** 渠道规范化：允许 wx / wechat / 微信、qq / QQ */
export function normalizeChannel(channel) {
  const text = String(channel || '').trim().toLowerCase()
  if (['qq', 'q', 'qq扫码'].includes(text)) return 'qq'
  return 'wx'
}

export async function startLogin(options = {}) {
  const channel = normalizeChannel(options.channel)

  if (channel === 'qq') {
    const { session, qrBase64 } = await createQr({ game: 'pubg' })
    return {
      session: {
        game: 'pubg',
        channel: 'qq',
        qq: session,
        createdAt: Date.now(),
        expiresAt: Date.now() + 3 * 60 * 1000
      },
      qr: toDataUrl(qrBase64),
      appName: '和平营地',
      channel: 'qq'
    }
  }

  const session = await createWxLoginSession()
  return {
    session: {
      game: 'pubg',
      channel: 'wx',
      ticket: session.ticket,
      uuid: session.uuid,
      createdAt: Date.now(),
      expiresAt: session.expiresAt || Date.now() + 3 * 60 * 1000
    },
    qr: toDataUrl(session.qrcodeBase64),
    appName: session.appName || '和平营地',
    channel: 'wx'
  }
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

  let camp
  try {
    camp = await pubgLoginByQq({
      access_token: token.access_token,
      openid: token.openid,
      pay_token: token.pay_token
    })
  } catch (error) {
    return { state: 'error', message: error?.message || String(error) }
  }

  saveAccount('pubg', camp, session.userKey)
  return { state: 'success', account: { userId: camp.userId, nickname: camp.nickname || camp.userName } }
}

export async function pollLogin(session) {
  if (session?.channel === 'qq') {
    try {
      return await pollQqLogin(session)
    } catch (error) {
      return { state: 'error', message: error?.message || String(error) }
    }
  }

  try {
    const camp = await waitForWxLogin(session, { timeoutMs: 2500, pollIntervalMs: 1000 })
    if (!camp?.userId) throw new Error('未取到营地账号信息')
    saveAccount('pubg', { ...camp, channel: 'wx', loginPlatform: 'wx' }, session.userKey)
    return { state: 'success', account: { userId: camp.userId, nickname: camp.nickname || camp.userName } }
  } catch (error) {
    const code = error?.code
    if (code === 'QR_TIMEOUT') return { state: 'pending' }
    if (code === 'QR_EXPIRED') return { state: 'expired', message: error.message }
    if (code === 'QR_CANCELED') return { state: 'canceled', message: error.message }
    return { state: 'error', message: error?.message || String(error) }
  }
}

function requireAccount(userKey) {
  const account = getAccount('pubg', userKey)
  if (!account) throw new Error('尚未登录和平营地，请先扫码')
  return account
}

/** 统一出入口：POST 表单 + 营地公共参数，返回原始 JSON */
async function campPost(path, account, extra = {}) {
  const body = new URLSearchParams({
    ...COMMON,
    openId: account.openId || '',
    gameOpenId: account.gameOpenId || account.openId || '',
    userId: account.userId || '',
    token: account.token || '',
    seasonId: account.seasonId || '0',
    ...extra
  })
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers: HEADERS, body: body.toString(), timeout: 20000 })
  return res.json()
}

/** 营地 ID ≠ 角色 ID：战绩类接口要的是角色 ID，先用「搜索自己」拿一次并缓存 */
async function roleIdOf(account, userKey) {
  if (account.roleId) return String(account.roleId)
  const json = await campPost('/search/getresultbytypev2', account, {
    keyword: account.userId,
    type: 'comprehensive',
    page: '1'
  })
  const hit = json?.data?.user?.list?.[0]
  const roleId = hit?.roleId ? String(hit.roleId) : ''
  // 顺手把游戏内昵称也带回来，界面上比营地昵称更像玩家
  if (roleId) saveAccount('pubg', { ...account, roleId, roleName: hit.roleName || '' }, userKey)
  return roleId
}

function checkEnvelope(json, label) {
  if (Number(json?.returnCode) !== 0) {
    throw new Error(`营地${label}接口返回异常：${json?.returnMsg || json?.returnCode || '未知错误'}`)
  }
  return json.data ?? {}
}

/** 角色卡：段位 / 场次 / 吃鸡数等概览 */
export async function profile(userKey) {
  const account = requireAccount(userKey)
  // friendUserId 要的是营地 ID，传角色 ID 会回「该用户暂无角色」
  const json = await campPost('/game/rolecard3', account, { friendUserId: String(account.userId || '') })
  const data = checkEnvelope(json, '角色卡')
  const card = data.roleCard || {}
  const record = (card.mainRecord || [])[0] || {}
  const pro = record.pro || []
  const num = (node) => Number(node?.[0]?.v?.v ?? 0) || 0

  return {
    nickname: card.roleName || account.nickname || '',
    level: card.level ?? '',
    area: card.roleArea || card.roleAreaText || '',
    server: card.roleServerText || card.serverName || '',
    online: Number(card.gameOnline) === 1,
    season: card.seasonName || '',
    honorLevel: card.honorLevel ?? '',
    highest: card.hisMaxSegmentLevel ?? '',
    lastBattleTime: card.lastBattleTime ? Number(card.lastBattleTime) * 1000 : 0,
    mode: record.title ? `${record.title}·${record.class || ''}` : '',
    rank: record.divName || record.class || '',
    score: record.currentScore ?? '',
    levelUpScore: record.levelUpScore ?? '',
    levelProc: record.levelProc ?? 0,
    matches: num(pro[0]),
    wins: num(pro[1])
  }
}

/** 最近战绩列表 */
export async function recent(userKey) {
  const account = requireAccount(userKey)
  const roleId = await roleIdOf(account, userKey)
  if (!roleId) throw new Error('没能取到你的营地角色 ID，请确认这个账号在和平营地里绑过角色')
  const json = await campPost('/play/getrecentbattlelist', account, { roleId, count: '10' })
  const data = checkEnvelope(json, '战绩')
  const list = data.list || []
  return {
    count: list.length,
    items: list.map(item => ({
      time: item.playTime || '',
      mode: item.modeDesc || '',
      map: item.mapDesc || '',
      rank: item.teamRank || '',
      kills: item.killingCount ?? '',
      damage: item.damageAmount ?? '',
      rating: item.ratingValue || '',
      mvp: Number(item.isMvp) === 1,
      modeIcon: item.modeIcon || '',
      rankIcon: item.rankIcon || '',
      battleId: String(item.battleId || ''),
      battleMode: String(item.battleMode || ''),
      assist: item.assistCount ?? item.assist ?? '',
      survivalTime: item.survivalTime || '',
      promotion: item.promotion || null
    }))
  }
}

/* ---------- 枪械熟练度 ---------- */

/**
 * 枪械熟练度：/play/getweaponinfos2 给每把枪的熟练度等级、击杀、爆头数、
 * 命中率、爆头率、单局均击杀与均伤害。图标按 ResID 拼 imgcdn。
 */
export async function weapons(userKey) {
  const account = requireAccount(userKey)
  const roleId = await roleIdOf(account, userKey)
  if (!roleId) throw new Error('没能取到你的营地角色 ID')
  const data = checkEnvelope(await campPost('/play/getweaponinfos2', account, { roleId }), '枪械')

  const items = (data.list || []).map(item => ({
    id: String(item.ResID || item.WeaponID || ''),
    name: item.Name || '',
    type: item.Type || '',
    // 上游用的 baike 目录，少了 baike 这层 CDN 会回「暂时无法查看」占位图
    icon: `https://imgcdn.gp.qq.com/images/baike/gun/${item.ResID || item.WeaponID || 0}.png`,
    level: item.WeaponLv ?? '',
    kills: Number(item.KillCount) || 0,
    heads: Number(item.HeadCount) || 0,
    maxKill: item.MaxKill ?? '',
    maxDamage: item.MaxDamage ?? '',
    hitRate: Number(item.HitRate) || 0,
    headRate: Number(item.HeadRate) || 0,
    killsPerGame: Number(item.KillPerGame) || 0,
    damagePerGame: Number(item.DamagePerGame) || 0,
    useTimes: Number(item.TotalUseTimes) || 0,
    color: item.Color || ''
  }))

  return { count: items.length, items: items.sort((a, b) => b.kills - a.kills) }
}

/* ---------- 印记 / 周报 ---------- */

/**
 * 王牌印记与荣誉墙：营地「印记」页面的那份数据。
 * 接口带一大堆 xxxTimes / xxxIcon，这里只挑有次数或必定展示的，避免刷屏。
 */
export async function honor(userKey) {
  const account = requireAccount(userKey)
  const roleId = await roleIdOf(account, userKey)
  if (!roleId) throw new Error('没能取到你的营地角色 ID')
  const data = checkEnvelope(await campPost('/play/gethonorinfo', account, { roleId }), '印记')

  const badges = [
    { name: '王牌印记', times: Number(data.wangpaiLevel) || 0, icon: data.wangpaiIcon },
    { name: '卓越印记', times: Number(data.zywptTimes) || 0, icon: data.zywptIcon },
    { name: '传奇印记', times: Number(data.cqwpTimes) || 0, icon: data.cqwpIcon },
    { name: '绝世印记', times: Number(data.jswpTimes) || 0, icon: data.jswpIcon },
    { name: '枪王印记', times: Number(data.qiangwangTimes) || 0, icon: data.qiangwangIcon },
    { name: '白手起家', times: Number(data.highestIncomeTimes) || 0, icon: data.highestIncomeUrl },
    { name: '金山银海', times: Number(data.jsyhTimes) || 0, icon: data.jsyhIcon },
    { name: '富可敌国', times: Number(data.fkdgTimes) || 0, icon: data.fkdgIcon },
    { name: '聚宝盆', times: Number(data.jbpTimes) || 0, icon: data.jbpIcon },
    { name: '财神显灵', times: Number(data.csxlTimes) || 0, icon: data.csxlIcon }
  ].filter(item => item.times > 0 && item.icon)

  return {
    highestDivName: data.highestDivName || '',
    highestDivTimes: data.highestDivTimes ?? '',
    highestDivIcon: data.highestDivUrl || '',
    bestIncomeName: data.highestIncomeName || '',
    bestIncomeTimes: data.highestIncomeTimes ?? '',
    bestIncomeValue: data.highestIncomeValue ?? '',
    bestIncomeSeason: data.highestIncomeSeason || '',
    likes: data.likeTimes ?? '',
    huntedDiv: data.highestHuntingDivName || '',
    huntedValue: data.highestHuntingValue ?? '',
    huntedSeason: data.highestHuntingSeason || '',
    vsTeamDiv: data.highestVsTeamDivName || '',
    badges
  }
}

/** 周报：本周场次 / 吃鸡 / 前十 / 击杀 / K/D / 积分变化 */
export async function weekly(userKey) {
  const account = requireAccount(userKey)
  const roleId = await roleIdOf(account, userKey)
  if (!roleId) throw new Error('没能取到你的营地角色 ID')
  const data = checkEnvelope(await campPost('/game/getweeklyreport', account, { roleId }), '周报')
  const item = (Array.isArray(data) ? data[0] : data) || {}

  return {
    segmentName: item.segmentName || '',
    segmentIcon: item.segmentPic || '',
    currentRating: item.currentRating ?? '',
    // 这些字段接口给的是字符串（"0"），不转数字会让 `battles ? a / battles : '—'` 判成真
    battles: Number(item.battleNum) || 0,
    wins: Number(item.winNum) || 0,
    top10: Number(item.top10Num) || 0,
    kills: Number(item.killNum) || 0,
    deaths: Number(item.deadNum) || 0,
    kd: Number(item.kd) || 0,
    ratingChange: Number(item.ratingChange) || 0,
    ratingChangeAvg: Number(item.ratingChangeAvg) || 0,
    mode: item.modeName || ''
  }
}

/* ---------- 单局详情 ---------- */

const DETAIL_API = 'https://c.gp.qq.com/gp/api/php/getpubgplaydetail.php'

/**
 * 单局详情。
 *
 * 注意走的是另一个域名（c.gp.qq.com 的 H5 php），参数与 formal 那套一致，
 * 额外要 battleId + battleMode + roleId，三者都来自最近战绩列表。
 * 返回值是「模块化」的：顶层字段 + dataList[type=team/equipment/kills/...]。
 */
export async function battleDetail(userKey, index = 1) {
  const account = requireAccount(userKey)
  const list = await recent(userKey)
  if (!list.count) throw new Error('最近没有可查的对局')

  const at = Math.min(Math.max(Number(index) || 1, 1), list.count) - 1
  const battle = list.items[at]
  if (!battle.battleId) throw new Error('这一局没有对局 ID，换一局试试')

  const roleId = await roleIdOf(account, userKey)
  const body = new URLSearchParams({
    ...COMMON,
    openId: account.openId || '',
    gameOpenId: account.gameOpenId || account.openId || '',
    userId: account.userId || '',
    token: account.token || '',
    seasonId: account.seasonId || '0',
    roleId: String(roleId),
    battleId: battle.battleId,
    battleMode: battle.battleMode
  })
  const res = await fetch(DETAIL_API, { method: 'POST', headers: HEADERS, body: body.toString(), timeout: 20000 })
  const json = await res.json()
  const d = checkEnvelope(json, '战绩详情')

  const blocks = d.dataList || []
  const block = type => blocks.find(item => item.type === type) || null
  const pick = value => (value && typeof value === 'object' ? value.v : value)

  const members = (block('team')?.data?.list || []).map((m, i) => {
    const info = {}
    for (const group of m.infoList || []) for (const it of group) info[it.k] = pick(it.v)
    return {
      index: i + 1,
      name: m.roleName || '',
      avatar: m.roleIcon || '',
      div: m.divName || '',
      mvp: String(m.ismvp) === '1',
      me: Boolean(d.roleName) && m.roleName === d.roleName,
      survival: m.survivalTime || '',
      evalIcon: m.infoList?.[0] ? '' : '',
      eval: info['评价'] || '',
      stats: Object.keys(info)
        .filter(key => key !== '评价')
        .slice(0, 4)
        .map(key => ({ label: key, value: info[key] }))
    }
  })

  return {
    index: at + 1,
    total: list.count,
    mapMode: d.mapMode || [battle.mode, battle.map].filter(Boolean).join(' · '),
    modeIcon: d.modeIcon || battle.modeIcon || '',
    bgImage: d.bgImage || '',
    playTime: d.playTime || battle.time || '',
    roleName: d.roleName || account.roleName || account.nickname || '',
    roleIcon: d.roleIcon || '',
    divName: d.divName || '',
    divIcon: d.divUrl || battle.rankIcon || '',
    hardType: d.hardType || '',
    result: d.result || '',
    resultDesc: d.resultDesc || '',
    mvp: Number(d.isMvp) === 1,
    rank: pick(d.rank) ?? battle.rank ?? '',
    kills: d.killingCount ?? battle.kills ?? '',
    damage: d.damageAmount ?? battle.damage ?? '',
    playerNum: d.playerNum ?? '',
    assist: d.assistCount ?? battle.assist ?? '',
    survival: d.survivalTime ?? battle.survivalTime ?? '',
    members
  }
}
