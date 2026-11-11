/**
 * 单条卡片的临时验证脚本：不经过机器人，只渲染一张图。
 *   node scripts/render-one.mjs heroesCard 猴
 *   node scripts/render-one.mjs pubgWeaponsCard owner
 *   node scripts/render-one.mjs valMatchDetailCard owner 1
 *
 * 第一个参数是 cards.mjs 导出的函数名，后面按顺序当实参传进去。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '..', 'preview')
fs.mkdirSync(OUT, { recursive: true })

const name = process.argv[2] || 'heroesCard'
const args = process.argv.slice(3)

async function main() {
  const { cardHtml } = await import('../src/game/render/card.mjs')
  const { renderHtmlToPng, closeRenderer } = await import('../src/game/render/shot.mjs')
  const cards = await import('../src/game/cards.mjs')

  if (typeof cards[name] !== 'function') {
    console.error(`cards.mjs 里没有 ${name}`)
    process.exit(1)
  }

  const payload = await cards[name](...args)
  const model = payload?.model || payload
  const { html, width, height } = cardHtml(model)

  const t0 = Date.now()
  const buf = await renderHtmlToPng(html, { width, height })
  const file = path.join(OUT, `${name}.jpg`)
  fs.writeFileSync(file, buf)
  console.log(`${file}  ${width}x${height}  ${(buf.length / 1024).toFixed(0)}KB  ${Date.now() - t0}ms`)
  await closeRenderer()
}

main()
