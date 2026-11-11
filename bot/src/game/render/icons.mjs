/**
 * 内联矢量图标：出图不再用 emoji 顶替图标。
 *
 * 全部是 24×24 viewBox 的原生 SVG，直接内联进 HTML（不走 <img> data URL），
 * 因此能用 var(--accent) 跟主题换色 —— 亮色深色、每款游戏的主色都自动对。
 * 描边统一 2px、圆角端点，和卡片 1px 边框 + 直角语言一致。
 */

const stroke = 'stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" fill="none"'

/** name → SVG 内部内容 */
const ICONS = {
  /* 王者荣耀：王冠 */
  crown: `<path ${stroke} d="M3.5 17.5 5 8l4.2 3.6L12 5.5l2.8 6.1L19 8l1.5 9.5z"/>
    <path ${stroke} d="M4.5 20.5h15"/>`,

  /* 和平精英：降落伞 */
  parachute: `<path fill="currentColor" d="M12 3.5C7 3.5 3.5 7.2 3.5 11.5h17C20.5 7.2 17 3.5 12 3.5z"/>
    <path ${stroke} d="M7.5 11.5 10 16.5M16.5 11.5 14 16.5M12 11.5v5"/>
    <rect x="9.5" y="16.5" width="5" height="4" rx="1.2" fill="currentColor"/>`,

  /* 无畏契约：准星 */
  crosshair: `<circle cx="12" cy="12" r="7.5" ${stroke}/>
    <circle cx="12" cy="12" r="2.2" fill="currentColor"/>
    <path ${stroke} d="M12 2.2v3.6M12 18.2v3.6M2.2 12h3.6M18.2 12h3.6"/>`,

  /* 通用 / 设置：滑杆 */
  gear: `<path ${stroke} d="M4 7h8.5M17.5 7H20M4 12h2.5M11.5 12H20M4 17h8.5M17.5 17H20"/>
    <circle cx="15" cy="7" r="2.4" fill="currentColor"/>
    <circle cx="9" cy="12" r="2.4" fill="currentColor"/>
    <circle cx="15" cy="17" r="2.4" fill="currentColor"/>`,

  /* 游戏手柄 */
  gamepad: `<rect x="2.5" y="7" width="19" height="10.5" rx="4.75" ${stroke}/>
    <path ${stroke} d="M7.5 10.5v3.5M5.75 12.25h3.5"/>
    <circle cx="15.8" cy="10.9" r="1.4" fill="currentColor"/>
    <circle cx="18" cy="13.8" r="1.4" fill="currentColor"/>`,

  /* ping / 延迟：心跳线 */
  pulse: `<path ${stroke} d="M2.5 12h4L9 6l5 12 2.5-6h5"/>`,

  /* 打招呼 / 对话：气泡 */
  chat: `<path ${stroke} d="M20 12.5a2.5 2.5 0 0 1-2.5 2.5H10l-5 4v-4h-.5A2.5 2.5 0 0 1 2 12.5v-7A2.5 2.5 0 0 1 4.5 3h13A2.5 2.5 0 0 1 20 5.5z"/>`,

  /* 概览 / 图表 */
  chart: `<path fill="currentColor" d="M4 20.5v-9h3.2v9zM10.4 20.5V5h3.2v15.5zM16.8 20.5v-6H20v6z"/>`,

  /* 成功 */
  check: `<circle cx="12" cy="12" r="9" ${stroke}/>
    <path ${stroke} stroke-width="2.4" d="M7.5 12.5l3 3 6-6.5"/>`,

  /* 等待 / 超时：沙漏 */
  hourglass: `<path ${stroke} d="M6.5 3h11M6.5 21h11M7.5 3v2.5c0 2.6 4.5 3.6 4.5 6.5s-4.5 3.9-4.5 6.5V21M16.5 3v2.5c0 2.6-4.5 3.6-4.5 6.5s4.5 3.9 4.5 6.5V21"/>`,

  /* 取消 / 禁止 */
  prohibit: `<circle cx="12" cy="12" r="8.5" ${stroke} stroke-width="2.2"/>
    <path ${stroke} stroke-width="2.2" d="M6 18 18 6"/>`,

  /* 失败 / 警告：描边三角 + 感叹号，不依赖任何底色 */
  warn: `<path ${stroke} d="M12 3.5 21.5 20.5h-19z"/>
    <path ${stroke} d="M12 9.5v4.5"/>
    <circle cx="12" cy="17" r="1.2" fill="currentColor"/>`,

  /* 已扫码：眼睛 */
  eye: `<path ${stroke} d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z"/>
    <circle cx="12" cy="12" r="3" fill="currentColor"/>`,

  /* 指令列表 / 选择 */
  folder: `<path ${stroke} d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.5l2 2.5H18A2.5 2.5 0 0 1 20.5 9.5v7A2.5 2.5 0 0 1 18 19H6a2.5 2.5 0 0 1-2.5-2.5z"/>`,

  /* 登录：钥匙 */
  key: `<circle cx="15" cy="8.5" r="4" ${stroke}/>
    <path ${stroke} d="M12.2 11.3 4 19.5M6.8 16.7 5.3 18.2M9.6 13.9 8.1 15.4"/>`
}

/** 历史遗留：卡片模型里存的是 emoji，这里把它翻译成图标名，调用方不用改 */
const EMOJI_TO_ICON = {
  '👑': 'crown',
  '🪂': 'parachute',
  '🎯': 'crosshair',
  '⚙️': 'gear',
  '🎮': 'gamepad',
  '🏓': 'pulse',
  '👋': 'chat',
  '📊': 'chart',
  '✅': 'check',
  '⌛': 'hourglass',
  '🚫': 'prohibit',
  '⚠️': 'warn',
  '👀': 'eye',
  '🗂️': 'folder',
  '🔑': 'key'
}

/** 生成内联 SVG 片段；尺寸由外层 CSS 控制（.badge svg） */
export function iconSvg(name) {
  const body = ICONS[name]
  if (!body) return ''
  return `<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">${body}</svg>`
}

/** emoji → 图标名，认不出来给空（调用方就不渲染徽标） */
export function iconOfEmoji(emoji) {
  if (!emoji) return ''
  return EMOJI_TO_ICON[String(emoji).trim()] || ''
}

/** 按游戏取图标名 */
export const GAME_ICONS = { kog: 'crown', pubg: 'parachute', val: 'crosshair', common: 'gear' }
