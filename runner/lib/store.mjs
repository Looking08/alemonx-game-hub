/**
 * 插件持久数据：宿主通过 ALX_PLUGIN_STORE 指向 <workspace>/store/game-hub，
 * 升级插件不会清空。这里只放「账号凭证」和「当前扫码会话」两类文件。
 */
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const fallback = path.join(os.tmpdir(), 'game-hub-store')

export const storeDir = process.env.ALX_PLUGIN_STORE || fallback

function ensure() {
  try {
    fs.mkdirSync(storeDir, { recursive: true, mode: 0o700 })
  } catch {
    // 目录已存在或无权限，交给后续读写报错
  }
}

function file(name) {
  return path.join(storeDir, name)
}

export function readJson(name, fallbackValue = null) {
  ensure()
  try {
    const text = fs.readFileSync(file(name), 'utf8')
    return JSON.parse(text)
  } catch {
    return fallbackValue
  }
}

export function writeJson(name, value) {
  ensure()
  const target = file(name)
  const tmp = `${target}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, target)
}

export function removeFile(name) {
  try {
    fs.unlinkSync(file(name))
  } catch {
    // 不存在即视为成功
  }
}

/* ---------- 账号（多用户） ---------- */

const ACCOUNTS = 'accounts.json'
/** 没有明确用户时落在这里：web 管理面板 / 单机管理员 */
export const OWNER = 'owner'

/**
 * 磁盘格式 v2：{ version: 2, users: { [userKey]: { kog: {...}, val: {...} } } }
 * 旧格式（v1）是扁平的 { kog: {...} }，读取时自动迁移到 OWNER 名下。
 */
function readAccounts() {
  const raw = readJson(ACCOUNTS, null)
  if (!raw) return { version: 2, users: {} }
  if (raw.version === 2 && raw.users) return raw
  // v1 → v2：扁平结构整体搬到 OWNER
  const games = {}
  for (const [key, value] of Object.entries(raw)) {
    if (value && typeof value === 'object' && !key.startsWith('_')) games[key] = value
  }
  return { version: 2, users: Object.keys(games).length ? { [OWNER]: games } : {} }
}

function writeAccounts(db) {
  writeJson(ACCOUNTS, { version: 2, users: db.users })
}

export function listUsers() {
  return readAccounts().users
}

export function getAccount(game, userKey = OWNER) {
  const db = readAccounts()
  return db.users?.[userKey]?.[game] || null
}

/** 某个用户名下所有已登录的游戏 */
export function listAccounts(userKey = OWNER) {
  const db = readAccounts()
  return db.users?.[userKey] || {}
}

export function saveAccount(game, account, userKey = OWNER) {
  const db = readAccounts()
  const key = String(userKey || OWNER)
  if (!db.users[key]) db.users[key] = {}
  db.users[key][game] = { ...account, savedAt: new Date().toISOString() }
  writeAccounts(db)
  return db.users[key][game]
}

export function dropAccount(game, userKey = OWNER) {
  const db = readAccounts()
  const key = String(userKey || OWNER)
  if (db.users?.[key]?.[game]) {
    delete db.users[key][game]
    if (!Object.keys(db.users[key]).length) delete db.users[key]
    writeAccounts(db)
  }
}

/* ---------- 扫码会话（按用户各存一份，多人可同时扫） ---------- */

const SESSIONS = 'sessions.json'
const LEGACY_SESSION = 'session.json'

/**
 * 上游的 expiresAt 三种形态都见过：毫秒数、秒级时间戳、ISO 字符串。
 * 统一折算成毫秒，否则「秒」会被当成 1970 年而立刻判定过期、把会话删掉。
 */
function toMs(value) {
  if (value === null || value === undefined || value === '') return 0
  if (typeof value === 'string') {
    const parsed = Date.parse(value)
    if (!Number.isNaN(parsed)) return parsed
    const numeric = Number(value)
    return Number.isFinite(numeric) ? toMs(numeric) : 0
  }
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value <= 0) return 0
    return value < 1e12 ? value * 1000 : value
  }
  return 0
}

function readSessions() {
  const all = readJson(SESSIONS, null)
  if (all && typeof all === 'object') return all
  // 旧版单会话文件，顺手迁移到 owner 名下
  const legacy = readJson(LEGACY_SESSION, null)
  if (legacy) return { [OWNER]: { ...legacy, userKey: OWNER } }
  return {}
}

export function getSession(userKey = OWNER) {
  const key = String(userKey || OWNER)
  const s = readSessions()[key]
  if (!s) return null
  const expires = toMs(s.expiresAt)
  // 只有明确拿到过期时间才做清理，读不懂就当作仍有效
  if (expires && Date.now() > expires + 60_000) {
    clearSession(key)
    return null
  }
  return s
}

export function saveSession(session) {
  const key = String(session.userKey || OWNER)
  const all = readSessions()
  all[key] = {
    ...session,
    userKey: key,
    expiresAt: toMs(session.expiresAt) || Date.now() + 3 * 60 * 1000
  }
  writeJson(SESSIONS, all)
  removeFile(LEGACY_SESSION)
}

export function clearSession(userKey = OWNER) {
  const key = String(userKey || OWNER)
  const all = readSessions()
  if (all[key]) {
    delete all[key]
    writeJson(SESSIONS, all)
  }
  removeFile(LEGACY_SESSION)
}

/** 脱敏：只在 UI 上展示后四位 */
export function maskToken(token = '') {
  const text = String(token)
  if (!text) return ''
  if (text.length <= 8) return '****'
  return `${text.slice(0, 4)}…${text.slice(-4)}`
}
