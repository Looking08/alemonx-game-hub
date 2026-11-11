/**
 * 游戏指令的桥接层：直接复用 ALemonX 插件 game-hub 的适配器代码，
 * 账号库也指向同一个目录，所以「工作台里登录过的账号」和「群里登录的账号」是同一份数据。
 *
 * 通过 GAME_HUB_ROOT 指定插件目录；默认按 ALemonX 的标准安装位置推断。
 */
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

export const HUB_ROOT =
  process.env.GAME_HUB_ROOT || path.join(os.homedir(), 'alemonx', 'workspace', 'plugins', 'game-hub')

// store.mjs 在 import 时就读取这个变量，必须先设置再动态 import
process.env.ALX_PLUGIN_STORE ||= path.join(os.homedir(), 'alemonx', 'workspace', 'store', 'game-hub')

const load = rel => import(pathToFileURL(path.join(HUB_ROOT, rel)).href)

export const games = {
  kog: () => load('runner/games/kog.mjs'),
  pubg: () => load('runner/games/pubg.mjs'),
  val: () => load('runner/games/val.mjs')
}

export const store = () => load('runner/lib/store.mjs')

export const GAME_NAMES = { kog: '王者荣耀', pubg: '和平精英', val: '无畏契约' }

/** 每个游戏支持的登录渠道，顺序即展示顺序 */
export const LOGIN_CHANNELS = {
  kog: ['wx', 'qq'],
  pubg: ['wx', 'qq'],
  val: ['wx', 'qq']
}

export const CHANNEL_NAMES = { wx: '微信', qq: 'QQ' }

/** 登录指令的默认渠道（不带参数时） */
export const DEFAULT_CHANNEL = 'wx'

/**
 * 从指令参数里认出渠道。
 * 认得出返回 'wx' / 'qq'，认不出返回 ''（调用方据此判断是不是「带了别的东西」）。
 */
export function channelOfArg(arg) {
  const text = String(arg || '')
    .trim()
    .toLowerCase()
  if (!text) return ''
  if (/^(qq|q|企鹅|扣扣)$/.test(text)) return 'qq'
  if (/^(wx|weixin|wechat|微信|微|vx)$/.test(text)) return 'wx'
  return ''
}

/** 每个游戏登录成功后该提示用户发什么指令 */
export const AFTER_LOGIN = {
  kog: '王者主页 / 王者战绩 / 王者详细1 / 英雄列表 / 英雄皮肤',
  pubg: '角色卡 / 和平战绩 / 和平详细1 / 枪械熟练度 / 王牌印记 / 和平周报',
  val: '瓦面板 / 瓦战绩 / 瓦详细1 / 瓦枪械 / 瓦特工 / 瓦地图'
}

/** 兼容两种入参：框架的 useEvent() 结果（{ current }）或事件本体 */
function eventBody(event) {
  return event?.current || event || {}
}

/** 聊天平台上的用户标识：同一个 QQ 在群里、私聊里都是同一份凭证 */
export function userKeyOf(event) {
  const cur = eventBody(event)
  const id = cur.UserId || cur.UserKey || cur.userId || ''
  return id ? `qq:${id}` : 'owner'
}

/** 群号（有 GuildId 就是群聊，否则当私聊）。主动消息要用它回推结果 */
export function targetOf(event) {
  const cur = eventBody(event)
  const guild = String(cur.GuildId || '')
  if (guild && guild !== '0') return { scope: 'group', targetId: guild }
  return { scope: 'c2c', targetId: String(cur.UserId || '') }
}

/** data URL / base64 → Buffer，用于发图片 */
export function toBuffer(dataUrlOrBase64) {
  const text = String(dataUrlOrBase64 || '')
  const base64 = text.startsWith('data:') ? text.slice(text.indexOf(',') + 1) : text
  return Buffer.from(base64, 'base64')
}

/**
 * 指令名 → { game, channel }。
 * channel 为空表示「没写死，允许用参数指定」，默认微信。
 */
const LOGIN_ALIAS = {
  营地登录: ['kog', ''],
  王者登录: ['kog', ''],
  王者营地登录: ['kog', ''],
  王者微信登录: ['kog', 'wx'],
  王者QQ登录: ['kog', 'qq'],
  营地QQ登录: ['kog', 'qq'],
  营地微信登录: ['kog', 'wx'],

  和平登录: ['pubg', ''],
  和平精英登录: ['pubg', ''],
  和平营地登录: ['pubg', ''],
  和平微信登录: ['pubg', 'wx'],
  和平QQ登录: ['pubg', 'qq'],

  瓦登录: ['val', ''],
  无畏登录: ['val', ''],
  无畏契约登录: ['val', ''],
  掌瓦登录: ['val', ''],
  瓦微信登录: ['val', 'wx'],
  瓦QQ登录: ['val', 'qq'],
  掌瓦QQ登录: ['val', 'qq'],
  无畏QQ登录: ['val', 'qq']
}

/** → { game, channel } 或 null */
export function loginCommandOf(key) {
  const hit = LOGIN_ALIAS[String(key || '').trim()]
  if (!hit) return null
  return { game: hit[0], channel: hit[1] }
}

export function gameOfLoginCommand(key) {
  return loginCommandOf(key)?.game || ''
}

export const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))
