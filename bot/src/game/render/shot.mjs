/**
 * HTML → PNG。
 *
 * 三层：
 *   1. 内容哈希缓存 —— 同一张卡片第二次直接读文件，0 耗时
 *   2. 长驻 puppeteer 浏览器 —— 复用同一个 Chrome 进程，单张 0.5~1.5 秒
 *   3. 一次性 chrome --screenshot 兜底 —— 没装 puppeteer 时也能出图（单张约 10 秒）
 *
 * 为什么串行：一次只截一张，避免并发把 CPU 打满。队列里排队最坏也就多等一两秒。
 *
 * 早期版本每张都新起一个 Chrome，冷启动 ~10 秒，用户发「状态」要干等 20 秒。
 * 换成复用浏览器后单张降到 1 秒内；再加上预热脚本，常用卡片基本是秒回。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { spawn } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const CACHE_DIR = path.join(HERE, 'cache')
const TMP_DIR = path.join(os.tmpdir(), 'alx-card-html')
const SCALE = 2
const MAX_CACHE = 300
const NAV_TIMEOUT = 20_000
const CLI_TIMEOUT = 40_000
/** 空闲这么久就把 Chrome 关掉，别一直占着几百兆内存 */
const IDLE_MS = 5 * 60_000

const CHROME_CANDIDATES = [
  process.env.CHROME_BIN,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium'
].filter(Boolean)

let chromePath = ''
function findChrome() {
  if (chromePath) return chromePath
  for (const bin of CHROME_CANDIDATES) {
    if (fs.existsSync(bin)) {
      chromePath = bin
      return bin
    }
  }
  throw new Error('没找到 Chrome / Edge，无法渲染图片')
}

/* ---------------- 长驻浏览器 ---------------- */

let browserPromise = null
let idleTimer = null

async function getBrowser() {
  if (browserPromise) return browserPromise
  browserPromise = (async () => {
    const mod = await import('puppeteer-core').catch(() => null)
    const puppeteer = mod?.default || mod
    if (!puppeteer?.launch) throw new Error('没有可用的 puppeteer-core')
    const browser = await puppeteer.launch({
      executablePath: findChrome(),
      headless: true,
      args: [
        // 这台机器 Chrome 的内层沙箱起不来
        '--no-sandbox',
        '--disable-gpu',
        '--disable-dev-shm-usage',
        '--hide-scrollbars',
        '--no-first-run',
        '--no-default-browser-check',
        '--disable-extensions',
        '--disable-background-networking',
        '--disable-sync',
        '--disable-crash-reporter',
        '--mute-audio'
      ]
    })
    browser.on('disconnected', () => {
      browserPromise = null
    })
    return browser
  })()
  browserPromise.catch(() => {
    browserPromise = null
  })
  return browserPromise
}

async function dropBrowser() {
  const pending = browserPromise
  browserPromise = null
  clearTimeout(idleTimer)
  if (!pending) return
  try {
    const browser = await pending
    await browser?.close()
  } catch {
    // 已经挂了就算了
  }
}

function touchIdle() {
  clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    dropBrowser()
  }, IDLE_MS)
  idleTimer.unref?.()
}

async function shotWithBrowser(html, width, height, format = 'jpeg', quality = 88) {
  const browser = await getBrowser()
  const page = await browser.newPage()
  try {
    await page.setViewport({ width, height, deviceScaleFactor: SCALE })
    await page.setContent(html, { waitUntil: 'load', timeout: NAV_TIMEOUT })
    // 等字体真正排好，否则中文可能用兜底字体、行高错位
    await page.evaluate(() => (document.fonts?.ready ?? Promise.resolve()).then(() => true))
    return await page.screenshot(format === 'png' ? { type: 'png' } : { type: 'jpeg', quality })
  } finally {
    await page.close().catch(() => {})
  }
}

/* ---------------- 兜底：一次性 chrome 截图 ---------------- */

function shotWithCli(html, width, height) {
  const stamp = createHash('sha1').update(`${Date.now()}${Math.random()}`).digest('hex').slice(0, 12)
  const htmlFile = path.join(TMP_DIR, `${stamp}.html`)
  const pngFile = path.join(TMP_DIR, `${stamp}.png`)
  fs.writeFileSync(htmlFile, html)

  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'alx-shot-'))
  const args = [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--disable-dev-shm-usage',
    '--hide-scrollbars',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-extensions',
    '--disable-crash-reporter',
    '--disable-background-networking',
    `--user-data-dir=${profile}`,
    `--force-device-scale-factor=${SCALE}`,
    `--window-size=${width},${height}`,
    `--screenshot=${pngFile}`,
    `file://${htmlFile}`
  ]

  return new Promise((resolve, reject) => {
    const child = spawn(findChrome(), args, { stdio: 'ignore' })
    const timer = setTimeout(() => {
      child.kill('SIGKILL')
      reject(new Error('渲染超时'))
    }, CLI_TIMEOUT)

    child.on('error', error => {
      clearTimeout(timer)
      reject(new Error(`Chrome 启动失败：${error.message}`))
    })
    child.on('exit', code => {
      clearTimeout(timer)
      let buffer
      try {
        buffer = fs.readFileSync(pngFile)
      } catch {
        reject(new Error(`渲染没产出（exit=${code}）`))
        return
      }
      if (!buffer.length) {
        reject(new Error('渲染出空图'))
        return
      }
      resolve(buffer)
    })
  }).finally(() => {
    fs.rmSync(profile, { recursive: true, force: true })
    fs.rmSync(htmlFile, { force: true })
    fs.rmSync(pngFile, { force: true })
  })
}

/* ---------------- 缓存 / 队列 ---------------- */

let lastTrim = 0
function trimCache() {
  if (Date.now() - lastTrim < 60_000) return
  lastTrim = Date.now()
  try {
    const files = fs
      .readdirSync(CACHE_DIR)
      .filter(name => name.endsWith('.png') || name.endsWith('.jpg'))
      .map(name => {
        const file = path.join(CACHE_DIR, name)
        return { file, mtime: fs.statSync(file).mtimeMs }
      })
      .sort((a, b) => a.mtime - b.mtime)
    const extra = files.length - MAX_CACHE
    for (let i = 0; i < extra; i += 1) fs.rmSync(files[i].file, { force: true })
  } catch {
    // 清理失败不影响出图
  }
}

let chain = Promise.resolve()
function enqueue(task) {
  const run = chain.then(task, task)
  chain = run.catch(() => {})
  return run
}

function shot(html, width, height, { format = 'jpeg', quality = 88 } = {}) {
  fs.mkdirSync(CACHE_DIR, { recursive: true })
  fs.mkdirSync(TMP_DIR, { recursive: true })

  const ext = format === 'png' ? 'png' : 'jpg'
  const key = createHash('sha1').update(`${width}x${height}\n${format}\n${html}`).digest('hex')
  const cacheFile = path.join(CACHE_DIR, `${key}.${ext}`)

  try {
    return Promise.resolve(fs.readFileSync(cacheFile))
  } catch {
    // 未命中，继续渲染
  }

  return shotWithBrowser(html, width, height, format, quality)
    .catch(error => {
      // 浏览器方式失败（没装 puppeteer / 崩溃），退回一次性截图（只有 png）
      console.error('[render] 浏览器渲染失败，改用一次性 Chrome：', error?.message || error)
      return shotWithCli(html, width, height)
    })
    .then(buffer => {
      if (!buffer?.length) throw new Error('渲染出空图')
      fs.writeFileSync(cacheFile, buffer)
      trimCache()
      touchIdle()
      return buffer
    })
}

/** 对外：HTML → 图片 Buffer。默认 JPEG（氛围渐变图 PNG 会大 3~5 倍），二维码等需要无损的传 format:'png' */
export function renderHtmlToPng(html, { width, height, format = 'jpeg', quality = 88 } = {}) {
  return enqueue(() => shot(html, width, height, { format, quality }))
}

/** 进程退出前收尾，避免留下孤儿 Chrome */
export function closeRenderer() {
  return dropBrowser()
}

/**
 * 后台把浏览器先拉起来。启动时调一次，用户第一条指令就不用等那 8~19 秒的冷启动。
 * 失败无所谓，真渲染时会再试。
 */
export function warmRenderer() {
  return getBrowser()
    .then(browser => {
      touchIdle()
      return browser
    })
    .catch(() => null)
}
