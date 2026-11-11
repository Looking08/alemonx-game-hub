/**
 * 掌瓦接口探针：一次把所有 career 接口打一遍，打印字段结构。
 *
 * 用途：补功能前先看清上游到底给什么，免得照着猜的字段写适配器。
 *   node scripts/probe-val.mjs            # 用 owner 账号
 *   node scripts/probe-val.mjs qq:12345   # 指定用户
 *   node scripts/probe-val.mjs owner gun  # 只探某一条
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const STORE = path.join(os.homedir(), 'alemonx', 'workspace', 'store', 'game-hub', 'accounts.json')
const MVAL = 'https://app.mval.qq.com'
const UA =
  'mval/2.4.0.10053 Channel/10068 Manufacturer/Xiaomi ' +
  'Mozilla/5.0 (Linux; Android 14; 23117RK66C Build/V417IR; wv) ' +
  'AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 ' +
  'Chrome/101.0.4951.61 Mobile Safari/537.36'
const APPID = 'wxcbb49f1f39656c2a'

const userKey = process.argv[2] || 'owner'
const only = process.argv[3] || ''

const db = JSON.parse(fs.readFileSync(STORE, 'utf8'))
const account = db.users?.[userKey]?.val
if (!account) {
  console.error(`✗ ${userKey} 名下没有 val 账号`)
  process.exit(1)
}

const scene = account.role?.scene || ''
const cookie = [
  'clientType=9',
  `appid=${APPID}`,
  'acctype=wx',
  `openid=${account.openid}`,
  `access_token=${account.wt}`,
  `userId=${account.userId}`,
  'accountType=5',
  `tid=${account.wt}`
].join('; ')

const sleep = ms => new Promise(r => setTimeout(r, ms))

async function post(p, body) {
  const res = await fetch(`${MVAL}/go/codev/${p}?source_game_zone=codev&game_zone=codev`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'User-Agent': UA, Cookie: cookie },
    body: JSON.stringify(body)
  })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text.slice(0, 300) }
  }
}

/** 打印结构：键名 + 第一项的取值，数组只取首项 */
function shape(value, depth = 0) {
  const pad = '  '.repeat(depth)
  if (Array.isArray(value)) {
    if (!value.length) return '[]'
    return `[${value.length}]\n${pad}  ${shape(value[0], depth + 1)}`
  }
  if (value && typeof value === 'object') {
    return Object.entries(value)
      .map(([k, v]) => {
        if (v && typeof v === 'object') return `${pad}  ${k}: ${shape(v, depth + 1)}`
        const text = String(v ?? '')
        return `${pad}  ${k}: ${text.length > 60 ? `${text.slice(0, 60)}…` : text}`
      })
      .join('\n')
  }
  return String(value ?? '')
}

const TASKS = {
  overview: ['career/seasonoverview', { scene, mode: '255', season: '', source_game_zone: 'codev', game_zone: 'codev' }],
  gun: ['career/performance/gun', { scene, season_id: '', queue_id: '255', source_game_zone: 'codev', game_zone: 'codev' }],
  agent: ['career/performance/agent', { scene, season_id: '', queue_id: '255', source_game_zone: 'codev', game_zone: 'codev' }],
  map: ['career/performance/map', { scene, season_id: '', queue_id: '255', source_game_zone: 'codev', game_zone: 'codev' }],
  list: ['career/record/list', { scene, baton: '', mode_filter: '', source_game_zone: 'codev', game_zone: 'codev' }]
}

for (const [name, [p, body]] of Object.entries(TASKS)) {
  if (only && only !== name) continue
  await sleep(1200)
  const json = await post(p, body)
  const ok = String(json.result) === '0'
  console.log(`\n=== ${name} (${p}) ${ok ? '✓' : '✗'} ${ok ? '' : JSON.stringify(json).slice(0, 200)}`)
  if (ok) console.log(shape(json.data))
  if (name === 'list' && ok) {
    const b = json.data?.battle_list?.[0]
    if (b) {
      console.log(`\n  battle_id=${b.battle_id} game_mode_id=${b.game_mode_id} game_submode_id=${b.game_submode_id}`)
      // 顺手把单局两个接口也探一遍
      await sleep(1200)
      const board = await post('career/record/scoreboard', {
        scene,
        battle_id: b.battle_id,
        queue_id: b.game_mode_id,
        source_game_zone: 'codev',
        game_zone: 'codev'
      })
      console.log(`\n=== scoreboard(带 queue_id) ${String(board.result) === '0' ? '✓' : '✗'}`)
      if (String(board.result) === '0') console.log(shape(board.data))

      await sleep(1200)
      const rounds = await post('career/record/player/rounds', {
        scene,
        battle_id: b.battle_id,
        game_mode: b.game_submode_id,
        source_game_zone: 'codev',
        game_zone: 'codev'
      })
      console.log(`\n=== rounds ${String(rounds.result) === '0' ? '✓' : '✗'} ${String(rounds.result) === '0' ? '' : JSON.stringify(rounds).slice(0, 200)}`)
      if (String(rounds.result) === '0') console.log(shape(rounds.data))
    }
  }
}
