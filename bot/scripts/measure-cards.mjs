/**
 * 高度核对：把每个卡片模型渲染进 DOM，比对
 *   layout.mjs 算出来的 height  vs  真实 page.scrollHeight  vs  footer 底部位置
 * 三者不一致就会出「底部一片空白」或「页脚被裁」。
 *
 *   node scripts/measure-cards.mjs
 */
import puppeteer from 'puppeteer-core'
import { cardHtml } from '../src/game/render/card.mjs'
import * as cards from '../src/game/cards.mjs'

const CASES = [
  ['valPanelCard', ['owner']],
  ['kogProfileCard', ['owner']],
  ['kogMatchesCard', ['owner']],
  ['pubgWeaponsCard', ['owner']],
  ['pubgProfileCard', ['owner']],
  ['valAgentsCard', ['']],
  ['heroesCard', ['猴']],
  ['valMatchDetailCard', ['owner', '1']],
  ['statusCard', ['owner']]
]

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars']
})

for (const [name, args] of CASES) {
  if (typeof cards[name] !== 'function') {
    console.log(`- ${name} 不存在，跳过`)
    continue
  }
  let payload
  try {
    payload = await cards[name](...args)
  } catch (error) {
    console.log(`- ${name} 取数失败：${error.message}`)
    continue
  }
  const model = payload?.model || payload
  const { html, width, height } = cardHtml(model)

  const page = await browser.newPage()
  await page.setViewport({ width, height })
  await page.setContent(html, { waitUntil: 'load' })
  const info = await page.evaluate(() => {
    const pageEl = document.querySelector('.page')
    const footer = document.querySelector('footer')
    return {
      scrollH: pageEl.scrollHeight,
      footerBottom: Math.round(footer.getBoundingClientRect().bottom)
    }
  })
  await page.close()

  // 页脚下面应该正好是容器下内边距 26，多了就是白边、少了就是被裁
  const gap = height - info.footerBottom
  const overflow = info.scrollH - height
  const flag = Math.abs(gap - 26) > 4 || overflow > 0 ? '✗' : '✓'
  console.log(
    `${flag} ${name.padEnd(20)} 算=${height} 内容底=${info.footerBottom} 余=${gap} 溢出=${overflow}`
  )
}

await browser.close()
