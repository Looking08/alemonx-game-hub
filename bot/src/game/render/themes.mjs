/**
 * 色板：按 docs/UI设计规范.md 的四条理念重建。
 *
 * ① 亮色优先，深色是等价选项 —— 两套只差变量，组件结构完全共享。
 * ② 分区靠 1px 边框 + 分隔线 + 留白，不靠光。
 * ③ 零光效：没有光晕、没有渐变条、没有彩色阴影、没有毛玻璃。
 * ④ 层级靠字号 / 字重 / 颜色深浅。
 *
 * 语义色三档：正文 --text / 次要 --text-dim / 标签 --text-mute，禁止第四档。
 * 每款游戏只换 accent 一组（主色 + 7% 底 + 25% 描边），其余全站统一。
 */

/** 亮色底：冷灰白 + 纯白卡片 */
const LIGHT = {
  mode: 'light',
  bg: '#f4f6f8',
  bgSoft: '#eef1f4',
  panel: '#ffffff',
  panel2: '#f0f3f6',
  line: '#e3e7ec',
  text: '#1c2733',
  textDim: '#5c6b7a',
  textMute: '#8b97a3',
  win: '#0f9d6c',
  winSoft: 'rgba(15,157,108,.10)',
  winLine: 'rgba(15,157,108,.28)',
  lose: '#d8354a',
  loseSoft: 'rgba(216,53,74,.10)',
  loseLine: 'rgba(216,53,74,.28)',
  gold: '#b07d1a',
  goldSoft: 'rgba(176,125,26,.10)',
  goldLine: 'rgba(176,125,26,.30)',
  flat: '#8b97a3',
  flatSoft: 'rgba(139,151,163,.12)',
  flatLine: 'rgba(139,151,163,.30)',
  /** 白色剪影图标（掌瓦枪械）用的深色托板，两个主题都是深的 */
  plateDark: '#22333f',
  /** 图片上的功能性遮罩：亮色主题用白纱，文字保持深色可读 */
  maskTo: 'rgba(255,255,255,.94)'
}

/** 深色底：VALORANT 客户端配色，等价选项 */
const DARK = {
  mode: 'dark',
  bg: '#0f1923',
  bgSoft: '#16232e',
  panel: '#1b2a37',
  panel2: '#22333f',
  line: '#2b3d4c',
  text: '#ece8e1',
  textDim: '#8b9aa7',
  textMute: '#5f7180',
  win: '#19e5a0',
  winSoft: 'rgba(25,229,160,.14)',
  winLine: 'rgba(25,229,160,.34)',
  lose: '#ff4655',
  loseSoft: 'rgba(255,70,85,.14)',
  loseLine: 'rgba(255,70,85,.34)',
  gold: '#f5d67b',
  goldSoft: 'rgba(245,214,123,.14)',
  goldLine: 'rgba(245,214,123,.34)',
  flat: '#8b9aa7',
  flatSoft: 'rgba(139,154,167,.14)',
  flatLine: 'rgba(139,154,167,.32)',
  plateDark: '#22333f',
  maskTo: 'rgba(11,20,28,.94)'
}

/**
 * 每款游戏一组 accent。亮色下必须过对比度：
 * 王者金 #b07d1a、和平橙 #b45f1d、瓦红 #d8354a、通用靛 #3550b5，
 * 官方原色（#ff4655 这种）只允许出现在深色主题里。
 */
const ACCENTS = {
  kog: {
    name: '王者荣耀',
    light: '#b07d1a',
    lightSoft: 'rgba(176,125,26,.07)',
    lightLine: 'rgba(176,125,26,.26)',
    dark: '#f5d67b',
    darkSoft: 'rgba(245,214,123,.14)',
    darkLine: 'rgba(245,214,123,.32)'
  },
  pubg: {
    name: '和平精英',
    light: '#b45f1d',
    lightSoft: 'rgba(180,95,29,.07)',
    lightLine: 'rgba(180,95,29,.26)',
    dark: '#f0a13e',
    darkSoft: 'rgba(240,161,62,.14)',
    darkLine: 'rgba(240,161,62,.32)'
  },
  val: {
    name: '无畏契约',
    light: '#d8354a',
    lightSoft: 'rgba(216,53,74,.07)',
    lightLine: 'rgba(216,53,74,.25)',
    dark: '#ff4655',
    darkSoft: 'rgba(255,70,85,.16)',
    darkLine: 'rgba(255,70,85,.35)'
  },
  common: {
    name: 'mybot',
    light: '#3550b5',
    lightSoft: 'rgba(53,80,181,.07)',
    lightLine: 'rgba(53,80,181,.25)',
    dark: '#6b8afd',
    darkSoft: 'rgba(107,138,253,.16)',
    darkLine: 'rgba(107,138,253,.35)'
  }
}

/** 默认亮色；传 'dark' 切深色，结构不变 */
export function themeOf(key, mode = 'light') {
  const base = mode === 'dark' ? DARK : LIGHT
  const accent = ACCENTS[key] || ACCENTS.common
  const isDark = mode === 'dark'
  return {
    ...base,
    name: accent.name,
    accent: isDark ? accent.dark : accent.light,
    accentSoft: isDark ? accent.darkSoft : accent.lightSoft,
    accentLine: isDark ? accent.darkLine : accent.lightLine
  }
}

/** 单款游戏的 accent（卡片模型里 model.accent 优先，这里给菜单等静态场景用） */
export function accentOf(key, mode = 'light') {
  return themeOf(key, mode).accent
}

/** 主题名 → 卡片 CSS 变量串，组件里不出现任何颜色字面量 */
export function styleVars(theme) {
  return [
    `--bg:${theme.bg}`,
    `--bg-soft:${theme.bgSoft}`,
    `--panel:${theme.panel}`,
    `--panel-2:${theme.panel2}`,
    `--line:${theme.line}`,
    `--text:${theme.text}`,
    `--text-dim:${theme.textDim}`,
    `--text-mute:${theme.textMute}`,
    `--accent:${theme.accent}`,
    `--accent-soft:${theme.accentSoft}`,
    `--accent-line:${theme.accentLine}`,
    `--win:${theme.win}`,
    `--win-soft:${theme.winSoft}`,
    `--win-line:${theme.winLine}`,
    `--lose:${theme.lose}`,
    `--lose-soft:${theme.loseSoft}`,
    `--lose-line:${theme.loseLine}`,
    `--gold:${theme.gold}`,
    `--gold-soft:${theme.goldSoft}`,
    `--gold-line:${theme.goldLine}`,
    `--flat:${theme.flat}`,
    `--flat-soft:${theme.flatSoft}`,
    `--flat-line:${theme.flatLine}`,
    `--icon-plate-dark:${theme.plateDark}`,
    `--mask-to:${theme.maskTo}`
  ].join(';')
}

export const THEMES = ACCENTS
