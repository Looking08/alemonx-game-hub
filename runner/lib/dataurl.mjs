/**
 * 把上游返回的裸 base64 包成 data URL。
 * 上游的图有时是 JPEG 有时是 PNG，硬写 image/png 会让部分浏览器不渲染，所以按魔数嗅探。
 */
export function toDataUrl(base64 = '') {
  const text = String(base64)
  if (!text) return ''
  if (text.startsWith('data:')) return text

  const head = text.slice(0, 16)
  let mime = 'image/png'
  if (head.startsWith('/9j/')) mime = 'image/jpeg'
  else if (head.startsWith('iVBORw0KGgo')) mime = 'image/png'
  else if (head.startsWith('R0lGOD')) mime = 'image/gif'
  else if (head.startsWith('UklGR')) mime = 'image/webp'

  return `data:${mime};base64,${text}`
}
