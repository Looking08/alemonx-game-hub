/**
 * 指令分发层：只认路由 → 调视图 → 出图。
 * 数据拉取和排版分别在 cards.mjs / render/ 里，这里保持轻薄。
 */
import { Format, useEvent, useMessage, useRoute } from 'alemonjs'
import { userKeyOf } from './hub.mjs'
import {
  errorCard,
  heroesCard,
  heroSkinsCard,
  kogBattleDetailCard,
  kogMatchesCard,
  kogProfileCard,
  powerCard,
  pubgBattleDetailCard,
  pubgHonorCard,
  pubgProfileCard,
  pubgRecentCard,
  pubgWeaponsCard,
  pubgWeeklyCard,
  statusCard,
  unbindCard,
  valAgentsCard,
  valAgentsPerfCard,
  valMapsCard,
  valMatchDetailCard,
  valPanelCard,
  valPeersCard,
  valWeaponsCard
} from './cards.mjs'
import { gameHelpText, gameIdOf, level1Text, menuImage } from './menu.mjs'
import { sendCard } from './send.mjs'

/** 从路由里取参数；兼容「指令名 参数」和「指令名参数」两种写法 */
function argOf(route, event) {
  const args = route?.rawArgs || []
  if (args.length) return String(args[0]).trim()
  const raw = String(event?.MessageText || '').replace(/^[/#＃!！\s]+/, '').trim()
  const key = String(route?.key || '')
  if (!key || !raw.startsWith(key)) return ''
  return raw.slice(key.length).trim()
}

/**
 * 帮助：一级菜单（支持的三个游戏），带参数直接跳二级。
 * 菜单是预渲染的 PNG，命中就只发图；没有图（新机器没跑过 render.mjs）回退文本。
 */
function helpMenu(arg) {
  const gameId = gameIdOf(arg)
  const image = menuImage(gameId || 'help')
  if (image) return { image }
  return { text: gameId ? gameHelpText(gameId) : level1Text() }
}

/* ---------------- 对局详情：瓦详细1 / 王者详细1 / 和平详细1 ---------------- */

/**
 * 主写法是「游戏名 + 详细 + 局号」连写：`瓦详细1`、`王者详细2`、`和平详细3`。
 * 末尾数字就是第几局（1 = 最近一局，2 = 倒数第二局）。
 *
 * 路由是按第一个空格切词、拿整词比对的（`tokens[0]` 全等），没有前缀匹配，
 * 所以 index.js 里把 1~12 每个数字都注册了一遍；这里负责把
 * 「瓦详细3」还原成 { game: 'val', index: '3' }。
 */
const DETAIL_KEY = /^(瓦|无畏|无畏契约|掌瓦|王者|王者荣耀|和平|和平精英)(详细|详情)(\d{0,2})$/

/** 前缀 → 游戏 id */
export const DETAIL_WORD = {
  瓦: 'val',
  无畏: 'val',
  无畏契约: 'val',
  掌瓦: 'val',
  王者: 'kog',
  王者荣耀: 'kog',
  和平: 'pubg',
  和平精英: 'pubg'
}

/** 每种写法只保留一个主名字，报错提示和菜单都用它 */
export const DETAIL_NAME = {
  瓦: '瓦详细',
  无畏: '瓦详细',
  无畏契约: '瓦详细',
  掌瓦: '瓦详细',
  王者: '王者详细',
  王者荣耀: '王者详细',
  和平: '和平详细',
  和平精英: '和平详细'
}

/** 「瓦详细3」→ { game:'val', index:'3' }；不是这类指令返回 null */
export function parseDetailKey(key) {
  const hit = String(key || '')
    .trim()
    .match(DETAIL_KEY)
  if (!hit) return null
  return { game: DETAIL_WORD[hit[1]], index: hit[3] || '' }
}

/** 兼容老写法：「对局详情 瓦 2」→ { game:'val', index:'2' } */
const LEGACY_GAME = [
  [/^(王者|王者荣耀|kog|wz)$/i, 'kog'],
  [/^(和平|和平精英|pubg|hp)$/i, 'pubg'],
  [/^(瓦|无畏|无畏契约|掌瓦|val|valorant)$/i, 'val']
]

function parseDetailArgs(arg) {
  const tokens = String(arg || '')
    .trim()
    .split(/[\s,，]+/)
    .filter(Boolean)
  let game = ''
  let index = ''

  for (const token of tokens) {
    // 尾部的数字既是「第几局」，也要从游戏名里剥掉（用户常打成「瓦1」）
    const tail = token.match(/(\d+)$/)
    const num = tail ? tail[1] : ''
    const word = num ? token.slice(0, token.length - num.length) : token

    if (!word) {
      if (!index) index = num
      continue
    }

    const hit = LEGACY_GAME.find(([re]) => re.test(word))
    if (hit && !game) {
      game = hit[1]
      if (num && !index) index = num
    } else if (num && !index) {
      index = num
    }
  }

  return { game, index }
}

function battleDetailOf(userKey, game, index) {
  if (game === 'kog') return kogBattleDetailCard(userKey, index)
  if (game === 'pubg') return pubgBattleDetailCard(userKey, index)
  return valMatchDetailCard(userKey, index)
}

function detailPicker() {
  return {
    model: {
      eyebrow: '对局详情 · 选游戏',
      title: '要看哪一款的对局？',
      subtitle: '指令是「游戏名 + 详细 + 第几局」，比如 瓦详细2 就是倒数第二局',
      accent: '#5b7cfa',
      theme: 'common',
      icon: 'folder',
      sections: [
        { kind: 'chips', chips: ['瓦详细1', '王者详细1', '和平详细1'], hot: true }
      ],
      footer: '瓦详细1 · 王者详细2 · 和平详细3'
    },
    text: '用法：瓦详细1 / 王者详细1 / 和平详细1'
  }
}

function detailRoute(arg, userKey) {
  const { game, index } = parseDetailArgs(arg)
  if (!game) return detailPicker()
  return battleDetailOf(userKey, game, index)
}

/**
 * 连写指令 → handler。`局号` 可以省略（`瓦详细` 就是第 1 局），
 * 也可以放到空格后面（`瓦详细 2`），两条路都通。
 */
function detailHandlerOf(key, arg) {
  const parsed = parseDetailKey(key)
  if (!parsed) return null

  let index = parsed.index
  if (!index) {
    const num = String(arg || '')
      .trim()
      .match(/^(\d{1,2})$/)
    index = num ? num[1] : '1'
  }

  return (_, userKey) => battleDetailOf(userKey, parsed.game, index)
}

const ROUTES = {
  游戏帮助: (arg) => helpMenu(arg),
  王者帮助: () => helpMenu('kog'),
  和平帮助: () => helpMenu('pubg'),
  瓦帮助: () => helpMenu('val'),

  登录状态: (_, userKey) => statusCard(userKey),

  /* 老写法保留：对局详情 瓦 1 —— 老用户记着的指令不能突然不认 */
  对局详情: (arg, userKey) => detailRoute(arg, userKey),
  对局详细: (arg, userKey) => detailRoute(arg, userKey),
  对局: (arg, userKey) => detailRoute(arg, userKey),

  英雄列表: (arg) => heroesCard(arg),
  英雄皮肤: (arg) => heroSkinsCard(arg),
  查皮肤: (arg) => heroSkinsCard(arg),
  英雄战力: (arg) => powerCard(arg),
  王者主页: (_, userKey) => kogProfileCard(userKey),
  王者战绩: (_, userKey) => kogMatchesCard(userKey),
  王者对局详情: (arg, userKey) => kogBattleDetailCard(userKey, arg),

  角色卡: (_, userKey) => pubgProfileCard(userKey),
  和平战绩: (_, userKey) => pubgRecentCard(userKey),
  和平战绩详情: (arg, userKey) => pubgBattleDetailCard(userKey, arg),
  枪械熟练度: (_, userKey) => pubgWeaponsCard(userKey),
  王牌印记: (_, userKey) => pubgHonorCard(userKey),
  和平周报: (_, userKey) => pubgWeeklyCard(userKey),

  瓦英雄: (arg) => valAgentsCard(arg),
  瓦地图: (_, userKey) => valMapsCard(userKey),
  瓦面板: (_, userKey) => valPanelCard(userKey, 'panel'),
  瓦战绩: (_, userKey) => valPanelCard(userKey, 'battles'),
  瓦对局详情: (arg, userKey) => valMatchDetailCard(userKey, arg),
  瓦同场: (arg, userKey) => valPeersCard(userKey, arg),
  瓦枪械: (arg, userKey) => valWeaponsCard(userKey, arg),
  瓦特工: (_, userKey) => valAgentsPerfCard(userKey),

  解绑: (arg, userKey) => unbindCard(userKey, arg)
}

export default async () => {
  const [message] = useMessage()
  const [route] = useRoute()
  const [evt] = useEvent()
  const event = evt?.current || {}

  const key = String(route?.key || '').trim()
  const arg = argOf(route, event)
  const userKey = userKeyOf(event)

  // 连写指令（瓦详细1 / 王者详细2）不在 ROUTES 里，用正则现算一个 handler
  const handler = ROUTES[key] || detailHandlerOf(key, arg)

  if (!handler) {
    await sendCard(
      message,
      errorCard('未识别的指令', key || '(空)', ['游戏帮助', '瓦详细1', '王者详细1', '和平详细1'])
    )
    return
  }

  try {
    const result = await handler(arg, userKey)

    // 菜单图：直接发预渲染好的 PNG
    if (result?.image && !result?.model) {
      const format = Format.create()
      format.addImage(result.image)
      await message.send({ format })
      return
    }

    await sendCard(message, result)
  } catch (error) {
    const raw = error?.message || String(error)
    // 未登录是最常见的失败，直接给能照做的登录指令
    if (raw.includes('尚未登录') || raw.includes('请先扫码') || raw.includes('请先登录')) {
      await sendCard(message, errorCard('尚未登录', raw, ['营地登录', '和平登录', '瓦登录', '瓦登录 QQ']))
      return
    }
    // 对局详情在「隐藏战绩 / 本周没打」时是空数据，不是真出错，别报红
    if (/没有可(查看|查)|最近没有对局|暂无可展示/.test(raw)) {
      await sendCard(message, errorCard('暂无对局', raw, ['王者详细1', '和平详细1', '瓦详细1']))
      return
    }
    await sendCard(message, errorCard('查询失败', raw))
  }
}

/** 供离线自测：固定指令直接查表，连写指令（瓦详细2）走 detailHandlerOf */
export const handlers = Object.fromEntries(Object.entries(ROUTES))

export function resolveHandler(key, arg = '') {
  const name = String(key || '').trim()
  return ROUTES[name] || detailHandlerOf(name, arg)
}
