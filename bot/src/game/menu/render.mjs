/**
 * 把菜单 HTML 截成 PNG。
 *
 * 为什么不在运行时截：菜单是固定内容，现截现发每条指令要多等 1~2 秒，
 * 还会在机器人进程里留一堆 Chrome。这里一次性生成，运行时只发文件。
 *
 * 实现走 Chrome 的 `--screenshot` 一次性模式（不用 CDP）：
 * 这台机器上 Chrome 的内层沙箱起不来，必须 `--no-sandbox`；
 * 而且 CDP 的 WebSocket 会话在两三条消息后会被静默掐断，不可靠。
 * 于是改为固定画幅海报：先定画布尺寸，再让 HTML 填满它。
 *
 * 用法：node src/game/menu/render.mjs [help|kog|pubg|val]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { canvasOf, level1Html, level2Html } from './html.mjs'
import { GAMES } from './data.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT_DIR = path.join(HERE, 'img')
const TMP_DIR = path.join(os.tmpdir(), 'alx-menu-html')
const SCALE = 2
const VERBOSE = process.env.VERBOSE === '1'

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean)

function findChrome() {
  for (const bin of CHROME_CANDIDATES) {
    if (fs.existsSync(bin)) return bin
  }
  throw new Error('没找到 Chrome / Edge，装一个再跑（或设 CHROME_BIN 环境变量）')
}

/** 截一张：等进程退出、校验产物、超时兜底 */
function screenshot(chrome, htmlFile, outFile, width, height) {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'alx-shot-'))
  const args = [
    '--headless=new',
    // 这台机器上 Chrome 的内层沙箱起不来（Operation not permitted），必须关掉
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-crash-reporter',
    `--user-data-dir=${profile}`,
    `--force-device-scale-factor=${SCALE}`,
    `--window-size=${width},${height}`,
    `--screenshot=${outFile}`,
    `file://${htmlFile}`
  ]

  return new Promise((resolve, reject) => {
    const child = spawn(chrome, args, { stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error(`截图超时（${width}×${height}）`))
    }, 40000)

    child.on('error', error => {
      clearTimeout(timer)
      reject(new Error(`Chrome 启动失败：${error.message}`))
    })
    child.on('exit', code => {
      clearTimeout(timer)
      // 退出码 133 常见于 GPU 相关告警，只要产物在就认
      if (!fs.existsSync(outFile) || fs.statSync(outFile).size === 0) {
        reject(new Error(`截图没产出（exit=${code}）`))
        return
      }
      resolve(fs.statSync(outFile).size)
    })
  }).finally(() => {
    fs.rmSync(profile, { recursive: true, force: true })
  })
}

async function main() {
  const only = process.argv[2]
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(TMP_DIR, { recursive: true })
  const chrome = findChrome()
  if (VERBOSE) console.log('chrome:', chrome)

  const jobs = [{ name: 'help', html: level1Html() }]
  for (const game of GAMES) jobs.push({ name: game.id, html: level2Html(game) })

  for (const job of jobs) {
    if (only && job.name !== only) continue
    const [width, height] = canvasOf(job.name)
    const htmlFile = path.join(TMP_DIR, `${job.name}.html`)
    const outFile = path.join(OUT_DIR, `${job.name}.png`)
    fs.writeFileSync(htmlFile, job.html)
    fs.rmSync(outFile, { force: true })

    const bytes = await screenshot(chrome, htmlFile, outFile, width, height)
    console.log(`✓ ${job.name}.png  ${width}×${height} @${SCALE}x  ${(bytes / 1024).toFixed(0)} KB`)
  }
}

main().catch(error => {
  console.error('✗ 渲染失败：', error?.message || error)
  process.exit(1)
})
