/**
 * 和平营地接口探针：把候选接口一次打一遍，看哪些能用、字段长什么样。
 *   node scripts/probe-pubg.mjs [userKey] [only]
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const STORE = path.join(os.homedir(), 'alemonx', 'workspace', 'store', 'game-hub', 'accounts.json')
const BASE = 'https://formal.api.gp.qq.com'
const HEADERS = {
  'Content-Type': 'application/x-www-form-urlencoded',
  'User-Agent': 'Mozilla/5.0 (Linux; Android 10; ONEPLUS A6000) AppleWebKit/537.36'
}
const COMMON = { roleId: '0', count: '5', gameId: '20004', cGameId: '20004', cCurrentGameId: '20004' }

const userKey = process.argv[2] || 'owner'
const only = process.argv[3] || ''

const db = JSON.parse(fs.readFileSync(STORE, 'utf8'))
const a = db.users?.[userKey]?.pubg
if (!a) {
  console.error(`✗ ${userKey} 名下没有 pubg 账号`)
  process.exit(1)
}

const base = {
  ...COMMON,
  openId: a.openId || '',
  gameOpenId: a.gameOpenId || a.openId || '',
  userId: a.userId || '',
  token: a.token || '',
  seasonId: a.seasonId || '0'
}

const post = async (p, extra = {}, host = BASE) => {
  const body = new URLSearchParams({ ...base, ...extra })
  const res = await fetch(`${host}${p}`, { method: 'POST', headers: HEADERS, body: body.toString() })
  const text = await res.text()
  try {
    return JSON.parse(text)
  } catch {
    return { _raw: text.slice(0, 200) }
  }
}

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
        const t = String(v ?? '')
        return `${pad}  ${k}: ${t.length > 70 ? `${t.slice(0, 70)}…` : t}`
      })
      .join('\n')
  }
  return String(value ?? '')
}

const sleep = ms => new Promise(r => setTimeout(r, ms))

// 先取 roleId
const search = await post('/search/getresultbytypev2', { keyword: a.userId, type: 'comprehensive', page: '1' })
const roleId = String(search?.data?.user?.list?.[0]?.roleId || a.roleId || '')
console.log(`roleId = ${roleId}  (nickname ${search?.data?.user?.list?.[0]?.roleName || '?'})`)

const TASKS = {
  rolecard: ['/game/rolecard3', { friendUserId: String(a.userId) }],
  recent: ['/play/getrecentbattlelist', { roleId, count: '10' }],
  battlelist: ['/play/getpubgbattlelist', { roleId, page: '1', count: '10' }],
  weapon: ['/play/getweaponinfos2', { roleId }],
  honor: ['/play/gethonorinfo', { roleId }],
  weekly: ['/game/getweeklyreport', { roleId }],
  depot: ['/game/getdepotdetail', { roleId }],
  visits: ['/user/getvisits', { roleId }],
  coins: ['/user/getusercoins', { roleId }],
  hotrank: ['/game/gethotrank', { roleId }],
  filters: ['/play/getbattlefilters', { roleId }]
}

for (const [name, [p, extra]] of Object.entries(TASKS)) {
  if (only && only !== name) continue
  await sleep(900)
  const json = await post(p, extra)
  const ok = Number(json.returnCode) === 0
  console.log(`\n=== ${name} ${p} ${ok ? '✓' : `✗ ${json.returnCode} ${json.returnMsg || ''}`}`)
  if (ok) console.log(shape(json.data))
  if (name === 'recent' && ok) {
    const item = (json.data?.list || [])[0]
    if (item) {
      console.log(`\n  battleId=${item.battleId} battleMode=${item.battleMode}`)
    } else {
      console.log('  （列表为空，详情接口无样本）')
    }
  }
}
