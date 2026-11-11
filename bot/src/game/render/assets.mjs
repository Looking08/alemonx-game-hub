/**
 * 卡片里的图片：URL → 磁盘缓存 → base64 data URL。
 *
 * 为什么转 base64 内嵌：puppeteer 的 page.setContent 页面是 about:blank，
 * 加载 file:// 会被 CORS 拦掉；而直接写远程 URL 又要求截图时网络必须通，
 * 一旦某张图挂住，setContent 会一直等到超时才返回。
 *
 * 代价是 HTML 变大，但缓存命中后只是本地读文件 + 编码，几十毫秒。
 * 图片本身在卡片里占的像素很少，输出图（JPEG）体积不受影响。
 */
import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSET_DIR = path.join(HERE, 'assets')
const TIMEOUT = 6000
/** 腾讯 CDN 的「暂时无法查看」占位图固定是这个字节数 */
const PLACEHOLDER_BYTES = 5093
/** 单张失败后记住一段时间，别每条指令都去重试一个挂掉的图 */
const FAIL_TTL = 10 * 60_000
const failed = new Map()

function mimeOf(url) {
  const ext = String(url).split('?')[0].split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  return 'image/png'
}

/** 插件自带的图（提前烘好的特工头像 / 地图原画）走 `local:<绝对路径>`，不进下载缓存 */
function localData(url) {
  try {
    const buffer = fs.readFileSync(url.slice('local:'.length))
    if (!buffer.length) return ''
    return `data:${mimeOf(url)};base64,${buffer.toString('base64')}`
  } catch {
    return ''
  }
}

function readCached(file) {
  try {
    return fs.readFileSync(file)
  } catch {
    return null
  }
}

async function download(url) {
  const res = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT),
    headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15' }
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const buffer = Buffer.from(await res.arrayBuffer())
  if (!buffer.length) throw new Error('空图片')
  // 腾讯 CDN 对不存在的图片不返 404，而是回一张 120×120 的「暂时无法查看」，
  // 固定 5093 字节。判出来当失败处理，卡片才会退回序号而不是贴一张灰图。
  if (buffer.length === PLACEHOLDER_BYTES) throw new Error('占位图')
  return buffer
}

/** 单张：命中缓存直接读，否则下载后落盘。失败返回空串（卡片里不显示这张图） */
export async function imgData(url) {
  if (!url || typeof url !== 'string') return ''
  if (url.startsWith('data:')) return url
  if (url.startsWith('local:')) return localData(url)

  const key = createHash('sha1').update(url).digest('hex').slice(0, 20)
  const file = path.join(ASSET_DIR, key)

  const cached = readCached(file)
  // 早先版本可能把占位图当成功落了盘，这里顺手清掉
  if (cached?.length === PLACEHOLDER_BYTES) {
    try {
      fs.unlinkSync(file)
    } catch {}
  } else if (cached?.length) {
    return `data:${mimeOf(url)};base64,${cached.toString('base64')}`
  }

  const failedAt = failed.get(key)
  if (failedAt && Date.now() - failedAt < FAIL_TTL) return ''

  // 腾讯 CDN 在并发稍高时会偶发超时，重试一次就能过，别把图漏掉
  for (let attempt = 0; attempt < 2; attempt += 1) {
    try {
      const buffer = await download(url)
      fs.mkdirSync(ASSET_DIR, { recursive: true })
      fs.writeFileSync(file, buffer)
      failed.delete(key)
      return `data:${mimeOf(url)};base64,${buffer.toString('base64')}`
    } catch {
      if (attempt === 0) await new Promise(r => setTimeout(r, 250))
    }
  }
  failed.set(key, Date.now())
  return ''
}

/**
 * 批量下载，限流 6 并发，失败的再补一轮。
 * 返回和入参等长的数组，失败位是空串，调用方按需跳过。
 */
export async function imgList(urls, { concurrency = 4 } = {}) {
  const list = urls || []
  const out = new Array(list.length).fill('')

  const run = async indexes => {
    let cursor = 0
    const worker = async () => {
      while (cursor < indexes.length) {
        const i = indexes[cursor]
        cursor += 1
        out[i] = await imgData(list[i])
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, indexes.length || 1) }, worker))
  }

  await run(list.map((_, i) => i))

  // 第一轮有漏的再串行补一次（缓存命中后这一轮几乎没有成本）
  const missing = list.map((url, i) => (out[i] ? -1 : i)).filter(i => i >= 0)
  if (missing.length) await run(missing)

  return out
}

/** 缓存了多少张、占多大，给自检用 */
export function assetStats() {
  try {
    const files = fs.readdirSync(ASSET_DIR)
    const bytes = files.reduce((sum, name) => sum + (fs.statSync(path.join(ASSET_DIR, name)).size || 0), 0)
    return { count: files.length, mb: (bytes / 1024 / 1024).toFixed(1) }
  } catch {
    return { count: 0, mb: '0.0' }
  }
}
