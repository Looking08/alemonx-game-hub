/**
 * 王者荣耀适配：数据层与扫码登录直接复用上游 GloryOfKings-Plugin（MIT）的模块，
 * 只把云崽的宿主依赖换成本插件的 shim（见 lib/alx-shim.mjs、lib/alx-authstore.mjs）。
 */
import {
  createWechatLoginSession,
  waitForWechatLogin,
  createSpecialEncodeParam,
  createXLogUid,
  accountFromLogin
} from '../vendor/kog/wechatLogin.js'
import { createQr, pollQr, resolveToken } from '../vendor/qq/qr.mjs'
import { kogLoginByQq } from '../vendor/qq/camp.mjs'
import api from '../vendor/kog/api.js'
import { saveAccount, getAccount } from '../lib/store.mjs'
import { toDataUrl } from '../lib/dataurl.mjs'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const DATA_DIR = path.join(HERE, '..', 'data')
const HERO_CACHE = path.join(DATA_DIR, 'kog-heroes.json')
/** 英雄列表几乎不变，缓存一周；网络挂了就无限期用缓存 */
const HERO_TTL = 7 * 24 * 60 * 60 * 1000

function readJsonFile(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch {
    return null
  }
}

/**
 * 英雄列表（133 位）。
 *
 * pvp.qq.com 那个 herolist.json 是国内 CDN，但偶发 `fetch failed`，
 * 而「英雄列表 / 英雄皮肤」全靠它 —— 拉不到就整条指令失败。
 * 所以这里缓存到 data/ 下：新鲜就直读，过期先试网络，网络失败再用旧缓存。
 */
async function heroList() {
  const cache = readJsonFile(HERO_CACHE)
  if (cache?.items?.length && Date.now() - (cache.at || 0) < HERO_TTL) return cache.items

  // pvp.qq.com 偶发整段 fetch failed，重试一次基本就能过
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const list = await api.getHeroList()
      if (Array.isArray(list) && list.length) {
        try {
          fs.mkdirSync(DATA_DIR, { recursive: true })
          fs.writeFileSync(HERO_CACHE, JSON.stringify({ at: Date.now(), items: list }))
        } catch {
          // 缓存写不进去不影响这一次
        }
        return list
      }
    } catch {
      if (attempt === 0) await new Promise(resolve => setTimeout(resolve, 300))
    }
  }

  if (cache?.items?.length) return cache.items
  throw new Error('英雄列表拉不到（pvp.qq.com 无响应，且本地没有缓存）')
}

export const meta = {
  id: 'kog',
  name: '王者荣耀',
  upstream: 'https://gitee.com/Tloml-Starry/GloryOfKings-Plugin',
  publicQueries: ['英雄列表', '英雄战力', '英雄皮肤'],
  privateQueries: ['主页概览', '最近战绩', '对局详情'],
  loginHint: '微信 / QQ 扫码登录营地（不抓包）',
  loginChannels: ['wx', 'qq']
}

/** 渠道规范化：允许 wx / wechat / 微信、qq / QQ */
export function normalizeChannel(channel) {
  const text = String(channel || '').trim().toLowerCase()
  if (['qq', 'q', 'qq扫码'].includes(text)) return 'qq'
  return 'wx'
}

export async function startLogin(options = {}) {
  const channel = normalizeChannel(options.channel)

  if (channel === 'qq') {
    const { session, qrBase64 } = await createQr({ game: 'kog' })
    return {
      session: {
        game: 'kog',
        channel: 'qq',
        qq: session,
        xLogUid: createXLogUid(),
        createdAt: Date.now(),
        expiresAt: Date.now() + 3 * 60 * 1000
      },
      qr: toDataUrl(qrBase64),
      appName: '王者营地',
      channel: 'qq'
    }
  }

  const session = await createWechatLoginSession()
  // qrcodeBuffer / requestParams 不可 JSON 序列化，落盘前剔除
  return {
    session: {
      game: 'kog',
      channel: 'wx',
      xLogUid: session.xLogUid,
      sdkTicket: session.sdkTicket,
      uuid: session.uuid,
      createdAt: Date.now(),
      expiresAt: Date.now() + 3 * 60 * 1000
    },
    qr: toDataUrl(session.qrcodeBase64),
    appName: '王者营地',
    channel: 'wx'
  }
}

/** QQ 通道：轮询 → 换 token → 营地登录 */
async function pollQqLogin(session) {
  const polled = await pollQr(session.qq)
  if (polled.state === 'waiting') return { state: 'pending' }
  if (polled.state === 'scanned') return { state: 'pending', scanned: true }
  if (polled.state === 'expired') return { state: 'expired', message: polled.message }
  if (polled.state !== 'confirmed') {
    return { state: 'error', message: polled.message || 'QQ 扫码失败' }
  }

  let token
  try {
    token = await resolveToken(polled.checkSig, session.qq)
  } catch (error) {
    // 换票前置机被黑洞时把原因原样带回去，别让用户以为没扫上
    return { state: 'error', message: error?.message || String(error) }
  }

  let result
  try {
    result = await kogLoginByQq({
      access_token: token.access_token,
      openid: token.openid,
      pay_token: token.pay_token,
      xLogUid: session.xLogUid,
      specialEncodeParam: createSpecialEncodeParam()
    })
  } catch (error) {
    return { state: 'error', message: error?.message || String(error) }
  }

  const account = accountFromLogin(result.loginResponse)
  if (!account?.userId) {
    return { state: 'error', message: '营地没返回 userId，QQ 登录没成功' }
  }
  account.loginPlatform = 'qq'
  saveAccount('kog', account, session.userKey)
  return {
    state: 'success',
    account: { userId: account.userId, nickname: account.nickname || account.userName }
  }
}

/**
 * 单次轮询：上游函数是「一直等到扫码成功」的阻塞实现，
 * 这里给它 2.5 秒预算，超时当作 pending 返回，保证宿主 statusAction 快速返回。
 */
export async function pollLogin(session) {
  if (session?.channel === 'qq') {
    try {
      return await pollQqLogin(session)
    } catch (error) {
      return { state: 'error', message: error?.message || String(error) }
    }
  }

  try {
    const result = await waitForWechatLogin(session, {
      timeoutMs: 2500,
      pollIntervalMs: 1000
    })
    const account = result?.account || {}
    if (!account.userId) throw new Error('未取到营地账号信息')
    saveAccount('kog', account, session.userKey)
    return { state: 'success', account: { userId: account.userId, nickname: account.nickname || account.userName } }
  } catch (error) {
    const code = error?.code
    if (code === 'QR_TIMEOUT') return { state: 'pending' }
    if (code === 'QR_EXPIRED') return { state: 'expired', message: error.message }
    if (code === 'QR_CANCELED') return { state: 'canceled', message: error.message }
    return { state: 'error', message: error?.message || String(error) }
  }
}

/* ---------- 公开查询（不需要登录） ---------- */

export async function heroes() {
  const list = await heroList()
  const items = (Array.isArray(list) ? list : []).map(item => ({
    ename: item.ename,
    name: item.cname,
    title: item.title || '',
    skins: String(item.skin_name || '').split('|').filter(Boolean),
    avatar: `https://game.gtimg.cn/images/yxzj/img201606/heroimg/${item.ename}/${item.ename}.jpg`
  }))
  return { count: items.length, items }
}

export async function power(heroName) {
  if (!heroName) throw new Error('缺少英雄名参数')
  const regions = await api.getHeroFightingCapacity(heroName)
  const platformName = { aqq: '安卓QQ', awx: '安卓微信', iqq: '苹果QQ', iwx: '苹果微信' }
  const items = regions.map(item => ({
    platform: platformName[item.type] || item.type,
    province: item.province || '',
    provincePower: item.provincePower || '',
    city: item.city || '',
    cityPower: item.cityPower || '',
    district: item.area || '',
    districtPower: item.areaPower || '',
    guobiao: item.guobiao || '',
    updatedAt: item.updatetime || ''
  }))
  return { hero: heroName, items }
}

/**
 * 英雄皮肤：皮肤名来自 herolist.json 的 `skin_name`（竖线分隔），
 * 大图和缩略图都按「序号 = 皮肤在列表里的位置」拼 URL，
 * 实测小乔 11 个皮肤，第 12 张返回 404，所以序号是 1:1 的。
 *
 * -mobileskin- 是 727×1071 的竖版（约 190KB），-bigskin- 同尺寸但要 900KB，
 * 卡片里宽度只有 150 多像素，用 mobileskin 完全够，别为了大图把 HTML 撑到几兆。
 */
export async function skins(heroName) {
  const keyword = String(heroName || '').trim()
  if (!keyword) throw new Error('缺少英雄名参数')
  const list = await heroList()
  const hero = (Array.isArray(list) ? list : []).find(
    item => item.cname === keyword || item.cname.includes(keyword)
  )
  if (!hero) throw new Error(`没找到英雄「${keyword}」`)

  const names = String(hero.skin_name || '')
    .split('|')
    .filter(Boolean)
  const base = `https://game.gtimg.cn/images/yxzj/img201606/skin/hero-info/${hero.ename}/${hero.ename}`

  return {
    hero: hero.cname,
    title: hero.title || '',
    ename: hero.ename,
    avatar: `https://game.gtimg.cn/images/yxzj/img201606/heroimg/${hero.ename}/${hero.ename}.jpg`,
    count: names.length,
    items: names.map((name, index) => ({
      name,
      // 第一个是原皮，序号从 1 开始
      image: `${base}-mobileskin-${index + 1}.jpg`
    }))
  }
}

/* ---------- 需要营地登录态的查询 ---------- */

export async function profile(id, userKey) {
  const account = getAccount('kog', userKey)
  if (!account) throw new Error('尚未登录营地，请先扫码')
  const target = String(id || account.gameRoleId || account.userId || '')
  if (!target) throw new Error('缺少营地 ID')
  const data = await api.getProfile(target)
  return data
}

export async function matches(id, userKey) {
  const account = getAccount('kog', userKey)
  if (!account) throw new Error('尚未登录营地，请先扫码')
  const target = String(id || account.gameRoleId || account.userId || '')
  if (!target) throw new Error('缺少营地 ID')
  const data = await api.getMoreBattleList(target)
  return data
}

/**
 * 单局详情：先拿战绩列表，再用列表里那局自带的 battleType / gameSvrId /
 * relaySvrId / gameSeq 反查 /game/battledetail。
 *
 * battleDetailUrl 里的 toAppRoleId 是要塞给接口的 targetRoleId，
 * 少了它接口不报错、只是返回空数据 —— 这是上游踩过的坑。
 */
export async function battleDetail(userKey, index = 1) {
  const account = getAccount('kog', userKey)
  if (!account) throw new Error('尚未登录营地，请先扫码')
  const target = String(account.gameRoleId || account.userId || '')
  if (!target) throw new Error('缺少营地 ID')

  const listData = await api.getMoreBattleList(target)
  const list = listData?.data?.list || listData?.data?.battleList || []
  if (!list.length) throw new Error('这个号没有可查看的对局')

  const at = Math.min(Math.max(Number(index) || 1, 1), list.length) - 1
  const battle = list[at]
  const targetRoleId = String(battle.battleDetailUrl || '').match(/toAppRoleId=(\d+)/)?.[1] || ''

  const res = await api.getBattledetail(
    target,
    battle.battleType,
    battle.gameSvrId,
    battle.relaySvrId,
    targetRoleId,
    battle.gameSeq
  )
  const detail = res?.data || {}

  const head = detail.head || {}
  const body = detail.battle || {}
  const isBlue = String(head.acntCamp) === String(detail.blueTeam?.acntCamp)
  const myTeam = isBlue ? detail.blueTeam : detail.redTeam
  const enemyTeam = isBlue ? detail.redTeam : detail.blueTeam
  const myRoles = (isBlue ? detail.blueRoles : detail.redRoles) || []
  const enemyRoles = (isBlue ? detail.redRoles : detail.blueRoles) || []

  const playersOf = roles =>
    roles.map(item => {
      const records = item.battleRecords || {}
      const stats = item.battleStats || {}
      const skin = records.usedSkin || {}
      const hero = records.usedHero || {}
      return {
        name: item.basicInfo?.roleName || item.roleName || '',
        hero: hero.heroName || '',
        skin: skin.skinName || '',
        icon: skin.skinIcon128128 || hero.heroIcon || '',
        kills: stats.killCnt ?? '',
        deaths: stats.deadCnt ?? '',
        assists: stats.assistCnt ?? '',
        money: stats.money ?? '',
        grade: stats.gradeGame ?? '',
        equip: (records.finalEquips || []).map(e => e.equipIcon).filter(Boolean)
      }
    })

  return {
    index: at + 1,
    total: list.length,
    mapName: head.mapName || battle.mapName || '',
    mode: head.matchDesc || '',
    victory: Number(head.gameResult) === 1 || /胜/.test(String(head.gameResult ?? '')),
    tips: head.tips || '',
    startTime: body.startTime || battle.gametime || '',
    duration: body.usedTime ? `${Math.round(Number(body.usedTime) / 60)} 分钟` : '',
    myCamp: isBlue ? '蓝方' : '红方',
    enemyCamp: isBlue ? '红方' : '蓝方',
    myKda: myTeam ? `${myTeam.killCnt ?? ''}/${myTeam.deadCnt ?? ''}/${myTeam.assistCnt ?? ''}` : '',
    enemyKda: enemyTeam ? `${enemyTeam.killCnt ?? ''}/${enemyTeam.deadCnt ?? ''}/${enemyTeam.assistCnt ?? ''}` : '',
    myMoney: myTeam?.money ?? '',
    enemyMoney: enemyTeam?.money ?? '',
    myTower: myTeam?.towerCnt ?? '',
    enemyTower: enemyTeam?.towerCnt ?? '',
    myPlayers: playersOf(myRoles),
    enemyPlayers: playersOf(enemyRoles)
  }
}
