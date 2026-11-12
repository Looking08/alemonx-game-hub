/**
 * game-hub 的 Expose 提供者：把三款游戏的查询能力注册成结构化动作，
 * 供同一运行实例里的其他插件 / AI 调用（类似 MCP 工具）。
 *
 * 消费示例（在另一个插件里）：
 *   const client = Expose.create()
 *   const result = await client.call('game-hub', 'mybot', 'kog_profile', {}, { timeoutMs: 15000 })
 *   if (result.ok) { /* result.data = { status, text, data } *\/ }
 *
 * 设计约定：
 *  - 查询类动作复用 cards.mjs 的「拉数据 + 组装模型」函数，聊天指令出图走同一份代码；
 *  - data 字段是卡片模型的 JSON 字符串（结构随卡片种类变化，契约上只承诺字符串）；
 *  - 身份绑定消息主人：谁的消息链路里发起调用，就查谁的账号（见 shared.mjs）；
 *  - 扫码登录是交互流程（发二维码进群 + 轮询推进度），保留在聊天指令侧，不进 expose。
 */
import { Expose } from 'alemonjs'
import { GAME_NAMES, store } from '../game/hub.mjs'
import {
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
  unbindCard,
  valAgentsCard,
  valAgentsPerfCard,
  valMapsCard,
  valMatchDetailCard,
  valPanelCard,
  valPeersCard,
  valWeaponsCard
} from '../game/cards.mjs'
import { gameHelpText, level1Text } from '../game/menu.mjs'
import { dataQuery, emptyInput, int, obj, query, str } from './shared.mjs'

const keywordInput = obj({
  keyword: str('筛选关键词，如英雄名；留空返回全量', { minLength: 1, maxLength: 32 })
})

const indexInput = obj(
  { index: int('第几局（1 = 最近一局，2 = 倒数第二局）', { minimum: 1, maximum: 12 }) },
  ['index']
)

/* ---------------- 结构化：登录状态 ---------------- */

const statusOutput = obj(
  {
    logged: { type: 'integer', minimum: 0, maximum: 3, description: '已登录的游戏数' },
    games: {
      type: 'array',
      items: obj(
        {
          game: { type: 'string', enum: ['kog', 'pubg', 'val'] },
          name: str('游戏中文名'),
          logged: { type: 'boolean' },
          nickname: str('账号昵称，未登录为空'),
          channel: { type: 'string', enum: ['', 'wx', 'qq'], description: '登录渠道，未登录为空' },
          savedAt: str('登录日期 YYYY-MM-DD，未登录为空')
        },
        ['game', 'name', 'logged', 'nickname', 'channel', 'savedAt']
      )
    }
  },
  ['logged', 'games']
)

const get_status = dataQuery(
  '查询当前消息用户在三款游戏的登录状态（不返回任何凭证）',
  emptyInput,
  statusOutput,
  async (_input, userKey) => {
    const storeModule = await store()
    const accounts = storeModule.listAccounts(userKey)
    const games = ['kog', 'pubg', 'val'].map(id => {
      const account = accounts[id] || null
      const raw = String(account?.channel || account?.loginPlatform || '').toLowerCase()
      const channel = raw === 'qq' || raw === 'qqconnect' ? 'qq' : raw ? 'wx' : ''
      return {
        game: id,
        name: GAME_NAMES[id],
        logged: Boolean(account),
        nickname: account ? String(account.nickname || account.userName || account.roleName || '') : '',
        channel: account ? channel : '',
        savedAt: account && account.savedAt ? String(account.savedAt).slice(0, 10) : ''
      }
    })
    return { logged: games.filter(g => g.logged).length, games }
  }
)

/* ---------------- 帮助 ---------------- */

const get_help = query('查询指令菜单（含三款游戏的登录与查询指令）', emptyInput, () => ({
  text: [level1Text(), '', gameHelpText('kog'), '', gameHelpText('pubg'), '', gameHelpText('val')].join('\n')
}))

/* ---------------- 王者荣耀（kog） ---------------- */

const kog_heroes = query('查询王者荣耀全英雄列表，可按英雄名筛选', keywordInput, input =>
  heroesCard(input.keyword || '')
)
const kog_hero_skins = query(
  '按英雄名查询皮肤列表',
  obj({ hero: str('英雄名，如「李白」', { minLength: 1, maxLength: 16 }) }, ['hero']),
  input => heroSkinsCard(input.hero)
)
const kog_hero_power = query(
  '按英雄名查四平台（省/市/区县/国标）战力',
  obj({ hero: str('英雄名，如「李白」', { minLength: 1, maxLength: 16 }) }, ['hero']),
  input => powerCard(input.hero)
)
const kog_profile = query('查询当前消息用户的王者营地主页（需本人已扫码登录）', emptyInput, (_input, userKey) =>
  kogProfileCard(userKey)
)
const kog_matches = query('查询当前消息用户的最近战绩列表（需登录）', emptyInput, (_input, userKey) =>
  kogMatchesCard(userKey)
)
const kog_battle_detail = query('查询当前消息用户的对局详情（需登录）', indexInput, (input, userKey) =>
  kogBattleDetailCard(userKey, String(input.index))
)

/* ---------------- 和平精英（pubg） ---------------- */

const pubg_profile = query('查询当前消息用户的角色卡（需登录）', emptyInput, (_input, userKey) => pubgProfileCard(userKey))
const pubg_recent_matches = query('查询当前消息用户的最近战绩（需登录）', emptyInput, (_input, userKey) =>
  pubgRecentCard(userKey)
)
const pubg_battle_detail = query('查询当前消息用户的对局详情（需登录）', indexInput, (input, userKey) =>
  pubgBattleDetailCard(userKey, String(input.index))
)
const pubg_weapons = query('查询枪械熟练度（需登录）', emptyInput, (_input, userKey) => pubgWeaponsCard(userKey))
const pubg_honor = query('查询王牌印记（需登录）', emptyInput, (_input, userKey) => pubgHonorCard(userKey))
const pubg_weekly = query('查询和平周报（需登录）', emptyInput, (_input, userKey) => pubgWeeklyCard(userKey))

/* ---------------- 无畏契约（val） ---------------- */

const val_agents = query('查询无畏契约特工（英雄）资料，可按名称筛选（免登录）', keywordInput, input =>
  valAgentsCard(input.keyword || '')
)
const val_maps = query('查询无畏契约地图列表（免登录）', emptyInput, () => valMapsCard(''))
const val_panel = query('查询当前消息用户的个人面板：段位、胜率、ACS 等（需登录）', emptyInput, (_input, userKey) =>
  valPanelCard(userKey)
)
const val_match_detail = query('查询对局详情（十人数据 + 地图 + 比分，需登录）', indexInput, (input, userKey) =>
  valMatchDetailCard(userKey, String(input.index))
)
const val_peers = query('查询同场玩家（需登录）', indexInput, (input, userKey) => valPeersCard(userKey, String(input.index)))
const val_weapons = query(
  '查询枪械熟练度（需登录），可指定排序',
  obj({ sort: str('排序键，如 kills / hs / dmg，留空用默认', { maxLength: 16 }) }),
  (input, userKey) => valWeaponsCard(userKey, input.sort || '')
)
const val_agents_perf = query('查询特工熟练度统计（需登录）', emptyInput, (_input, userKey) => valAgentsPerfCard(userKey))

/* ---------------- 账号（写操作） ---------------- */

const unbind = query(
  '删除当前消息用户在指定游戏的登录凭证（只删本人）',
  obj({ game: { type: 'string', enum: ['kog', 'pubg', 'val'], description: '要解绑的游戏' } }, ['game']),
  (input, userKey) => unbindCard(userKey, input.game),
  'write'
)

/* ---------------- 提供者 ---------------- */

export const gameHubExpose = Expose.create().provide({
  name: 'game-hub',
  displayName: '游戏中心',
  entryCommand: '游戏帮助',
  version: '1.0.0',
  description:
    '王者荣耀 / 和平精英 / 无畏契约查询能力：英雄与战力等公开数据免登录；战绩、面板等需当前消息用户已通过聊天指令扫码登录。查询身份绑定消息主人，扫码登录是交互流程、请继续使用聊天指令。',
  actions: {
    get_help,
    get_status,
    kog_heroes,
    kog_hero_skins,
    kog_hero_power,
    kog_profile,
    kog_matches,
    kog_battle_detail,
    pubg_profile,
    pubg_recent_matches,
    pubg_battle_detail,
    pubg_weapons,
    pubg_honor,
    pubg_weekly,
    val_agents,
    val_maps,
    val_panel,
    val_match_detail,
    val_peers,
    val_weapons,
    val_agents_perf,
    unbind
  }
})

export default gameHubExpose
