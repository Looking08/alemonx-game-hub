/** 把结构化结果拼成适合聊天里看的纯文本（QQ 不保证等宽，所以不用表格对齐） */

export function line(...parts) {
  return parts.filter(x => x !== undefined && x !== null && x !== '').join(' · ')
}

export function list(items, mapper, limit = 10) {
  return items
    .slice(0, limit)
    .map((item, i) => `${i + 1}. ${mapper(item)}`)
    .join('\n')
}

export function title(text, sub) {
  return sub ? `【${text}】${sub}` : `【${text}】`
}

/** 统一的结果发送：有图就带图，没图就纯文本 */
export function blocks(text, image) {
  return { text, image }
}
