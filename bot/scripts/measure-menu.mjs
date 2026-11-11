/**
 * 量菜单海报的真实内容高度（截图是固定画幅，高度算小了会被裁掉）。
 *   node scripts/measure-menu.mjs
 */
import puppeteer from 'puppeteer-core'
import { level1Html, level2Html, canvasOf } from '../src/game/menu/html.mjs'
import { GAMES } from '../src/game/menu/data.mjs'

const jobs = [{ name: 'help', html: level1Html() }]
for (const game of GAMES) jobs.push({ name: game.id, html: level2Html(game) })

const browser = await puppeteer.launch({
  executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--hide-scrollbars']
})

for (const job of jobs) {
  const page = await browser.newPage()
  const [width, height] = canvasOf(job.name)
  await page.setViewport({ width, height, deviceScaleFactor: 1 })
  await page.setContent(job.html, { waitUntil: 'load' })
  const real = await page.evaluate(() => {
    const body = document.body
    const page_ = document.querySelector('.page')
    return {
      page: Math.ceil(page_.getBoundingClientRect().height),
      content: Math.ceil(body.scrollHeight)
    }
  })
  const need = Math.max(real.page, real.content)
  const flag = need > height ? `✗ 少了 ${need - height}px` : `✓ 余 ${height - need}px`
  console.log(`${job.name.padEnd(6)} 画幅 ${height}  实际 ${need}  ${flag}`)
  await page.close()
}

await browser.close()
