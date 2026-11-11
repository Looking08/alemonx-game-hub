/**
 * 菜单的运行时入口：只负责「把预渲染好的图片发出去」，
 * 图片不存在时回退成纯文本（换机器、没跑过 render.mjs 也不会瞎）。
 *
 * 图片用 src/game/menu/render.mjs 生成，改了指令文案记得重新跑一次。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { COMMON, GAMES, TIPS, gameById } from './menu/data.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const IMG_DIR = path.join(HERE, 'menu', 'img')

/** 'help' | 'kog' | 'pubg' | 'val' → Buffer；没有就返回 null */
export function menuImage(name) {
  const file = path.join(IMG_DIR, `${name}.png`)
  try {
    return fs.readFileSync(file)
  } catch {
    return null
  }
}

/** 指令名 → 游戏 id，一级菜单也能接参数（游戏帮助 王者） */
const GAME_ALIAS = {
  王者: 'kog',
  王者荣耀: 'kog',
  营地: 'kog',
  和平: 'pubg',
  和平精英: 'pubg',
  无畏: 'val',
  无畏契约: 'val',
  瓦: 'val',
  掌瓦: 'val'
}

const GAME_IDS = new Set(GAMES.map(g => g.id))

/** 同时认中文别名和内部 id（kog/pubg/val），指令里两种都可能出现 */
export const gameIdOf = text => {
  const key = String(text || '').trim()
  if (GAME_IDS.has(key)) return key
  return GAME_ALIAS[key] || ''
}

/* ---------------- 文本兜底 ---------------- */

const bullet = (items, mapper, limit = 20) => items.slice(0, limit).map(mapper).join('\n')

export function level1Text() {
  const blocks = GAMES.map(game => {
    const lines = [`【${game.name}】扫码登录：${game.channels.map(c => c.cmd).join(' / ')}`]
    if (game.publicQueries.length) lines.push(`免登录：${game.publicQueries.map(q => q.cmd).join(' / ')}`)
    lines.push(`需登录：${game.privateQueries.map(q => q.sample || q.cmd).join(' / ')}`)
    return lines.join('\n')
  })
  return [
    '【游戏帮助】支持 3 款游戏 · 微信 / QQ 双通道',
    '',
    blocks.join('\n\n'),
    '',
    `【${COMMON.title}】${COMMON.items.map(i => i.cmd).join(' / ')}`,
    '',
    `发「${GAMES.map(g => g.help).join('」「')}」看单个游戏的完整指令。`,
    ...TIPS.map(t => `· ${t}`)
  ].join('\n')
}

export function gameHelpText(id) {
  const game = gameById(id)
  if (!game) return level1Text()

  const lines = [
    `【${game.name}帮助】`,
    game.source,
    '',
    '扫码登录（微信 / QQ 各一条）：',
    ...game.channels.map(c => `· ${c.cmd}`)
  ]

  if (game.publicQueries.length) {
    lines.push('', '免登录：')
    lines.push(bullet(game.publicQueries, q => `· ${q.sample || q.cmd} —— ${q.desc}`))
  }

  lines.push('', '登录后：')
  lines.push(bullet(game.privateQueries, q => `· ${q.sample || q.cmd} —— ${q.desc}`))
  lines.push('', ...TIPS.map(t => `· ${t}`))
  lines.push('', '发「游戏帮助」看全部游戏')
  return lines.join('\n')
}
