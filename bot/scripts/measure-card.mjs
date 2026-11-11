/** 量一下卡片里各块的真实位置，验证 layout 常量算的高度和 DOM 是否一致 */
import puppeteer from 'puppeteer-core'
import { cardHtml } from '../src/game/render/card.mjs'

const model = {
  eyebrow: '测试',
  title: '间距',
  accent: '#e0a84e',
  theme: 'pubg',
  stats: [{ label: 'A', value: '1' }],
  sections: [{ kind: 'rows', rows: [{ main: 'x' }] }]
}

const { html, width, height } = cardHtml(model)
const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars']
})
const page = await browser.newPage()
await page.setViewport({ width, height })
await page.setContent(html, { waitUntil: 'load' })

const info = await page.evaluate(() => {
  const box = sel => {
    const el = document.querySelector(sel)
    if (!el) return null
    const r = el.getBoundingClientRect()
    return { top: Math.round(r.top), bottom: Math.round(r.bottom) }
  }
  const pageEl = document.querySelector('.page')
  return {
    pageBox: pageEl.getBoundingClientRect().height,
    scrollH: pageEl.scrollHeight,
    header: box('header'),
    stats: box('.stats'),
    row: box('.row-card'),
    footer: box('footer'),
    computedHeight: pageEl.style.height
  }
})
console.log(JSON.stringify(info, null, 1))
await browser.close()
