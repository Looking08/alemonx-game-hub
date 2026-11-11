/**
 * 聊天内扫码登录：二维码和结果都画成图片发回群里。
 *
 * 一个指令模块服务多个指令名，靠 useRoute().key 反查游戏；
 * 渠道（微信 / QQ）既可以用「瓦登录 QQ」这种参数指定，也有
 * 「瓦QQ登录」这种把渠道写进指令名的别名，两条路都走同一个函数。
 *
 * 轮询在后台跑，结果用主动消息推回原会话，指令本身不会被 100 秒的等待卡住。
 */
import { useEvent, useMessage, useRoute } from 'alemonjs'
import {
  CHANNEL_NAMES,
  DEFAULT_CHANNEL,
  LOGIN_CHANNELS,
  channelOfArg,
  games,
  loginCommandOf,
  sleep,
  store,
  targetOf,
  userKeyOf,
  GAME_NAMES
} from './hub.mjs'
import { loginQrCard, loginResultCard, errorCard } from './cards.mjs'
import { sendCard, pushCard } from './send.mjs'

/** 二维码有效期 3 分钟，这里留 100 秒给用户扫，超时就结束 */
const WATCH_MS = 100_000
const INTERVAL_MS = 1_200

/** 从路由里取参数；兼容「指令名 参数」和「指令名参数」两种写法 */
function argOf(route, event) {
  const args = route?.rawArgs || []
  if (args.length) return String(args[0]).trim()
  const raw = String(event?.MessageText || '')
    .replace(/^[/#＃!！\s]+/, '')
    .trim()
  const key = String(route?.key || '')
  if (!key || !raw.startsWith(key)) return ''
  return raw.slice(key.length).trim()
}

/**
 * 后台轮询：和 web 面板是同一套 pollLogin，只是结果用主动消息推回去。
 * session 里必须带 userKey —— pollLogin 靠它决定凭证存给谁。
 */
async function watch(game, session, ctx) {
  const module = await games[game]()
  const storeModule = await store()
  const deadline = Date.now() + WATCH_MS
  let announced = false

  while (Date.now() < deadline) {
    const result = await module.pollLogin(session).catch(error => ({
      state: 'error',
      message: error?.message || String(error)
    }))

    if (result.state === 'success') {
      storeModule.clearSession(ctx.userKey)
      const who = result.account?.nickname || result.account?.userId || ''
      await pushCard(ctx.target, loginResultCard(game, 'success', who, { channel: ctx.channel, warning: result.warning }))
      return
    }

    if (result.state === 'expired' || result.state === 'canceled' || result.state === 'error') {
      storeModule.clearSession(ctx.userKey)
      await pushCard(ctx.target, loginResultCard(game, result.state, result.message, { channel: ctx.channel }))
      return
    }

    if (result.scanned && !announced) {
      announced = true
      await pushCard(ctx.target, loginResultCard(game, 'scanned', '', { channel: ctx.channel }))
    }

    await sleep(INTERVAL_MS)
  }

  storeModule.clearSession(ctx.userKey)
  await pushCard(ctx.target, loginResultCard(game, 'timeout', '', { channel: ctx.channel }))
}

export default async () => {
  const [message] = useMessage()
  const [route] = useRoute()
  const [evt] = useEvent()

  const event = evt?.current || {}
  const userKey = userKeyOf(event)
  const target = targetOf(event)
  const command = loginCommandOf(route?.key)
  const game = command?.game || ''

  if (!game) {
    await sendCard(
      message,
      errorCard('未识别的登录指令', '可用：营地登录 / 和平登录 / 瓦登录', ['营地登录 QQ', '和平登录 QQ', '瓦登录 QQ'])
    )
    return
  }

  // 渠道：指令名里带（瓦QQ登录）优先，其次是指令参数（瓦登录 QQ），最后才用默认微信
  const argChannel = channelOfArg(argOf(route, event))
  const channel = command?.channel || argChannel || DEFAULT_CHANNEL

  if (!(LOGIN_CHANNELS[game] || []).includes(channel)) {
    await sendCard(
      message,
      errorCard(
        `${GAME_NAMES[game]}不支持${CHANNEL_NAMES[channel] || channel}登录`,
        `这个游戏目前只开了${(LOGIN_CHANNELS[game] || ['wx']).map(c => CHANNEL_NAMES[c]).join(' / ')}扫码`,
        [`${GAME_NAMES[game]}登录`]
      )
    )
    return
  }

  const module = await games[game]()
  const storeModule = await store()

  // 同一用户重复发指令时先作废上一份会话，避免两个二维码抢同一个账号位
  storeModule.clearSession(userKey)

  let started
  try {
    started = await module.startLogin({ channel })
  } catch (error) {
    await sendCard(
      message,
      errorCard(`申请${GAME_NAMES[game]}${CHANNEL_NAMES[channel]}二维码失败`, error?.message || String(error))
    )
    return
  }

  const { session, qr, appName } = started
  storeModule.saveSession({ ...session, appName, userKey, channel })

  await sendCard(message, await loginQrCard(game, qr, appName, { channel }))

  // 不 await：让指令立刻结束，结果稍后推回来
  watch(game, { ...session, userKey, channel }, { userKey, target, channel }).catch(error => {
    console.error('[game-login] 轮询异常', error?.message || error)
  })
}
