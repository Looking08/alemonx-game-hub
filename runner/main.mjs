/**
 * ALX Setup 插件执行器入口。
 * 协议：stdin 读一条 JSON 请求，stdout 输出唯一一条 JSON 响应，日志与进度走 stderr。
 */
import process from 'node:process'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import * as store from './lib/store.mjs'
import * as kog from './games/kog.mjs'
import * as pubg from './games/pubg.mjs'
import * as val from './games/val.mjs'

// 版本号只认 alx.json，避免发版时两处不一致
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)))
const VERSION = JSON.parse(readFileSync(join(ROOT, 'alx.json'), 'utf8')).version
const GAMES = { kog, pubg, val }

const progress = (stage, percent, message) => {
  process.stderr.write(`@alx-progress ${JSON.stringify({ stage, percent, message })}\n`)
}

const log = (...args) => {
  process.stderr.write(`[game-hub] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`)
}

/* ---------------- 动作实现 ---------------- */

function describeGame(game, userKey) {
  const module = GAMES[game]
  if (!module) return null
  const account = store.getAccount(game, userKey)
  const session = store.getSession(userKey)
  return {
    id: module.meta.id,
    name: module.meta.name,
    upstream: module.meta.upstream,
    loginHint: module.meta.loginHint,
    loginChannels: module.meta.loginChannels || ['wx'],
    publicQueries: module.meta.publicQueries,
    privateQueries: module.meta.privateQueries,
    loggedIn: Boolean(account),
    account: account
      ? {
          userId: account.userId || '',
          nickname: account.nickname || account.userName || '',
          avatar: account.avatar || '',
          channel: account.channel || account.loginPlatform || '',
          savedAt: account.savedAt || '',
          invalid: Boolean(account.invalid)
        }
      : null,
    pendingSession: Boolean(session && session.game === game)
  }
}

async function actionStatus(params) {
  const userKey = String(params.userKey || store.OWNER)
  const games = Object.keys(GAMES).map(g => describeGame(g, userKey))
  return {
    output: `✓ 已装载 ${games.length} 个游戏适配器，${games.filter(g => g.loggedIn).length} 个已登录。`,
    data: { version: VERSION, storeDir: store.storeDir, games }
  }
}

async function actionLoginStart(params) {
  const game = String(params.game || '')
  const module = GAMES[game]
  if (!module) throw new Error(`未知游戏：${game || '(空)'}`)

  const userKey = String(params.userKey || store.OWNER)
  const channel = module.normalizeChannel?.(params.channel) || 'wx'
  const supported = module.meta.loginChannels || ['wx']
  if (!supported.includes(channel)) {
    throw new Error(`${module.meta.name}目前只支持${supported.map(c => (c === 'qq' ? ' QQ ' : '微信')).join('/')}扫码`)
  }

  const channelName = channel === 'qq' ? '手机 QQ' : '微信'
  progress('prepare', 10, `正在向 ${module.meta.name} 申请${channelName}登录二维码…`)
  const { session, qr, appName } = await module.startLogin({ channel })
  store.saveSession({ ...session, appName, userKey })
  progress('ready', 100, `二维码已生成，请用${channelName}扫码`)

  return {
    output: `✓ 已生成${appName || module.meta.name}登录二维码，请用${channelName}扫码。`,
    data: { sessionId: session.uuid || session.createdAt, qr, appName, channel, expiresAt: session.expiresAt }
  }
}

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

/**
 * 扫码等待：宿主是「一次动作 = 一个进程」，所以这里用一个阻塞动作
 * 把轮询循环包住（最多 90 秒），期间用 stderr 进度帧告诉 UI 进展。
 */
async function actionLoginAwait(params) {
  const session = store.getSession(String(params.userKey || store.OWNER))
  if (!session) throw new Error('没有进行中的扫码会话，请重新发起登录')

  const module = GAMES[session.game]
  if (!module) {
    store.clearSession(session.userKey)
    throw new Error('会话所属游戏不存在，已清理')
  }

  const deadline = Date.now() + 90_000
  let announcedScan = false
  progress('waiting', 20, '等待扫码…')

  while (Date.now() < deadline) {
    const result = await module.pollLogin(session)

    if (result.state === 'success') {
      progress('done', 100, '登录成功')
      store.clearSession(session.userKey)
      return {
        output: `✓ ${module.meta.name}登录成功：${result.account?.nickname || result.account?.userId || ''}`,
        data: {
          state: 'success',
          game: session.game,
          userKey: session.userKey || store.OWNER,
          account: describeGame(session.game, session.userKey)?.account || null
        }
      }
    }

    if (result.state === 'expired' || result.state === 'canceled' || result.state === 'error') {
      store.clearSession(session.userKey)
      throw new Error(result.message || '登录未完成')
    }

    if (result.scanned && !announcedScan) {
      announcedScan = true
      progress('scanned', 60, '已扫码，请在手机上确认')
    }
    await sleep(1200)
  }

  throw new Error('等待扫码超时（90 秒），请重新发起')
}

async function actionAccountRemove(params) {
  const game = String(params.game || '')
  if (!GAMES[game]) throw new Error(`未知游戏：${game || '(空)'}`)
  const userKey = String(params.userKey || store.OWNER)
  store.dropAccount(game, userKey)
  return { output: `✓ 已移除${GAMES[game].meta.name}的本地凭证。`, data: { game } }
}

/* ---------------- 路由 ---------------- */

/** 适配器返回的都是结构化数据，工作台既要一句人话总结，也要一份能给表格用的 data */
async function wrap(pending, summary) {
  const data = await pending
  let text = ''
  try {
    text = summary(data) || ''
  } catch {
    // 字段对不上就只给「完成」，别把整次请求拖挂
  }
  return { output: text || '✓ 完成。', data }
}

const uk = p => String(p?.userKey || store.OWNER)

const ROUTES = {
  status: p => actionStatus(p || {}),
  'login.start': p => actionLoginStart(p),
  'login.await': p => actionLoginAwait(p || {}),
  'account.remove': p => actionAccountRemove(p),

  'kog.heroes': () => kog.heroes(),
  'kog.skins': p => wrap(
    kog.skins(String(p.hero || '')),
    d => `${d.hero}${d.title ? ` · ${d.title}` : ''}：共 ${d.count} 款皮肤（${d.items.map(i => i.name).join('、')}）`
  ),
  'kog.power': p => kog.power(String(p.hero || '')),
  'kog.profile': p => kog.profile(p.id, uk(p)),
  'kog.matches': p => kog.matches(p.id, uk(p)),
  'kog.battleDetail': p => wrap(
    kog.battleDetail(uk(p), p.index),
    d => `${d.mapName} · ${d.mode} · ${d.victory ? '胜利' : '失败'}｜我方 ${d.myKda} / 敌方 ${d.enemyKda}`
  ),

  'pubg.profile': p => pubg.profile(uk(p)),
  'pubg.recent': p => pubg.recent(uk(p)),
  'pubg.weapons': p => wrap(
    pubg.weapons(uk(p)),
    d => `共 ${d.count} 把枪：${d.items.map(i => `${i.name} Lv.${i.level}（${i.kills} 杀）`).join('、')}`
  ),
  'pubg.honor': p => wrap(
    pubg.honor(uk(p)),
    d => `最高 ${d.highestDivName}，印记：${d.badges.map(b => `${b.name}×${b.times}`).join(' ') || '暂无'}`
  ),
  'pubg.weekly': p => wrap(
    pubg.weekly(uk(p)),
    d => `本周 ${d.battles} 局，吃鸡 ${d.wins} 次，前十 ${d.top10} 次，K/D ${d.kd}`
  ),
  'pubg.battleDetail': p => wrap(
    pubg.battleDetail(uk(p), p.index),
    d => `${d.mapMode} · 第 ${d.rank} 名（淘汰 ${d.kills} / 伤害 ${d.damage}）`
  ),

  'val.agents': () => val.agents(),
  'val.maps': () => val.maps(),
  'val.panel': p => val.panel(uk(p)),
  'val.weapons': p => wrap(
    val.weapons(uk(p)),
    d => `共 ${d.count} 把枪，击杀前五：${d.items.slice(0, 5).map(i => `${i.name} ${i.kills} 杀`).join('、')}`
  ),
  'val.agentsPerf': p => wrap(
    val.agentsPerf(uk(p)),
    d => `本赛季用过 ${d.items.length} 位特工：${d.items.slice(0, 6).map(i => `${i.name} ${i.matches} 场`).join('、')}`
  ),
  'val.mapsPerf': p => wrap(
    val.mapsPerf(uk(p)),
    d => `本赛季打过 ${d.count} 张图：${d.items.map(i => `${i.name} 胜率 ${i.winRate}%`).join('、')}`
  ),
  'val.matchDetail': p => wrap(
    val.matchDetail(uk(p), p.index),
    d => `${d.mapName} ${d.winScore}:${d.loseScore} · ${d.myTeamText} / ${d.enemyTeamText}｜我的 ACS ${d.myScore}`
  ),
  'val.peers': async p => {
    // 同场玩家没有单独接口，就是这一局 scoreboard 的十个人，按 ACS 排
    const d = await val.matchDetail(uk(p), p.index)
    const items = [...(d.players || [])].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
    return {
      output: `${d.mapName}（${d.winScore}:${d.loseScore}）：${items
        .slice(0, 5)
        .map(i => `${i.agent || ''}·${i.name} ACS ${i.score || '—'}`)
        .join('、')}`,
      data: { map: d.mapName, items }
    }
  }
}

function normalize(result) {
  if (!result) return { output: '✓ 完成。' }
  if (typeof result === 'string') return { output: result }
  if (result.data === undefined && result.output === undefined) return { output: '✓ 完成。', data: result }
  return result
}

async function main() {
  let input = {}
  try {
    input = JSON.parse(await new Response(process.stdin).text())
  } catch {
    process.stdout.write(JSON.stringify({ error: '无法解析请求（stdin 不是合法 JSON）' }))
    return
  }

  if (input.protocol !== 'alx/v1' || input.method !== 'run') {
    process.stdout.write(JSON.stringify({ error: '不支持的 ALX Setup 插件协议' }))
    return
  }

  const action = String(input.action || '')
  const handler = ROUTES[action]
  if (!handler) {
    process.stdout.write(JSON.stringify({ error: `未知操作：${action || '(空)'}` }))
    return
  }

  try {
    const result = normalize(await handler(input.params || {}))
    process.stdout.write(JSON.stringify(result))
  } catch (error) {
    log('action failed', action, error?.message || String(error))
    process.stdout.write(JSON.stringify({ output: `! ${action} 失败。`, error: error?.message || String(error) }))
  }
}

main().catch(error => {
  process.stdout.write(JSON.stringify({ error: error?.message || String(error) }))
})
