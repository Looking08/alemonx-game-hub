/**
 * 把 valorant-api 的特工头像 / 地图原画烘成小图，随插件一起发。
 *
 * 为什么要烘：`media.valorant-api.com` 在国内 Node 直连拿不到（api 域名能通、media 域名不通），
 * 运行时下载会一直超时。这里用 curl（走系统代理）拉原图，再用 macOS 自带的 sips 缩到
 * 卡片里实际要用的尺寸 —— 30 张特工 + 27 张地图加起来才一兆出头，比每次去赌网络划算。
 *
 * 用法：node scripts/bake-val-assets.mjs [--force]
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))

const PLUGIN = process.env.GAME_HUB_ROOT || path.join(os.homedir(), 'alemonx', 'workspace', 'plugins', 'game-hub')
const OUT_DIR = path.join(PLUGIN, 'runner', 'data', 'val-assets')
const TMP = path.join(os.tmpdir(), 'val-bake')

const FORCE = process.argv.includes('--force')

const AGENT_SIZE = 192
const MAP_SIZE = 480

async function json(url) {
  // Node 的 fetch 不读系统代理，valorant-api 直连时通时不通，用 curl 稳一些
  const { stdout } = await run('curl', ['-sSL', '--max-time', '40', url], { maxBuffer: 32 * 1024 * 1024 })
  return JSON.parse(stdout)
}

/** 拉原图 → sips 缩放 → 落盘，返回文件名 */
async function bake(url, file, size) {
  const target = path.join(OUT_DIR, file)
  if (!FORCE && fs.existsSync(target) && fs.statSync(target).size > 0) return file

  const tmp = path.join(TMP, `${file}.src`)
  await run('curl', ['-sSL', '--max-time', '40', '-o', tmp, url])
  const stat = fs.statSync(tmp)
  if (!stat.size) throw new Error('空文件')
  await run('sips', ['-Z', String(size), tmp, '--out', target, '-s', 'format', 'jpeg', '-s', 'formatOptions', '82'])
  fs.rmSync(tmp, { force: true })
  return file
}

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
  fs.mkdirSync(TMP, { recursive: true })

  const agents = await json('https://valorant-api.com/v1/agents?language=zh-CN&isPlayableCharacter=true')
  const maps = await json('https://valorant-api.com/v1/maps?language=zh-CN')

  const manifest = { at: new Date().toISOString(), agents: {}, maps: {} }
  let ok = 0
  let fail = 0

  for (const agent of agents.data || []) {
    const url = agent.displayIconSmall || agent.displayIcon
    if (!url) continue
    const file = `agent-${agent.uuid}.jpg`
    try {
      await bake(url, file, AGENT_SIZE)
      manifest.agents[agent.uuid] = { name: agent.displayName, role: agent.role?.displayName || '', file }
      ok += 1
    } catch {
      fail += 1
    }
  }

  for (const map of maps.data || []) {
    const url = map.splash || map.listViewIcon
    if (!url) continue
    const file = `map-${map.uuid}.jpg`
    try {
      await bake(url, file, MAP_SIZE)
      manifest.maps[map.uuid] = { name: map.displayName, file }
      ok += 1
    } catch {
      fail += 1
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'manifest.json'), JSON.stringify(manifest))
  const bytes = fs
    .readdirSync(OUT_DIR)
    .filter(name => name.endsWith('.jpg'))
    .reduce((sum, name) => sum + fs.statSync(path.join(OUT_DIR, name)).size, 0)

  console.log(`✓ ${ok} 张已烘好，${fail} 张失败`)
  console.log(`  目录 ${OUT_DIR}`)
  console.log(`  体积 ${(bytes / 1024 / 1024).toFixed(2)} MB`)
}

main().catch(error => {
  console.error('✗', error.message)
  process.exit(1)
})
