/**
 * 指令分发层的离线自测：直接调 query.mjs 的 handler，确认每个指令都能拿到卡片模型。
 *   node scripts/test-handlers.mjs
 */
import { handlers, parseDetailKey, resolveHandler } from '../src/game/query.mjs'

const ARGS = {
  英雄列表: '猴',
  英雄皮肤: '小乔',
  查皮肤: '李白',
  英雄战力: '孙悟空',
  王者对局详情: '1',
  和平战绩详情: '1',
  瓦对局详情: '1',
  瓦同场: '1',
  瓦枪械: '爆头',
  瓦英雄: '',
  解绑: ''
}

let ok = 0
let bad = 0

/* ---- 第一步：连写指令的解析（纯正则，不碰网络） ---- */
const KEY_CASES = [
  ['瓦详细1', 'val', '1'],
  ['瓦详细12', 'val', '12'],
  ['瓦详情3', 'val', '3'],
  ['瓦详细', 'val', ''],
  ['无畏详细2', 'val', '2'],
  ['掌瓦详情4', 'val', '4'],
  ['王者详细2', 'kog', '2'],
  ['王者荣耀详情5', 'kog', '5'],
  ['和平详细3', 'pubg', '3'],
  ['和平精英详情6', 'pubg', '6'],
  ['对局详情', null, null],
  ['瓦战绩', null, null],
  ['瓦详细ABC', null, null]
]

console.log('— 连写指令解析 —')
for (const [key, game, index] of KEY_CASES) {
  const parsed = parseDetailKey(key)
  const pass = game === null ? parsed === null : parsed?.game === game && parsed?.index === index
  if (pass) {
    console.log(`✓ ${key.padEnd(10)} → ${game || '(不是单局指令)'}${index ? ' ' + index : ''}`)
    ok += 1
  } else {
    console.log(`✗ ${key.padEnd(10)} → ${JSON.stringify(parsed)}，期望 ${game} ${index}`)
    bad += 1
  }
}

/* 每条连写指令都得真的分到一个 handler（不能落到「未识别的指令」） */
console.log('\n— 连写指令分发 —')
for (const key of ['瓦详细1', '王者详细3', '和平详细12', '瓦详细']) {
  const handler = resolveHandler(key)
  if (typeof handler === 'function') {
    console.log(`✓ ${key}`)
    ok += 1
  } else {
    console.log(`✗ ${key} 没分到 handler`)
    bad += 1
  }
}

/* ---- 第二步：所有固定指令跑一遍真实数据 ---- */
console.log('\n— 固定指令 —')
for (const [key, handler] of Object.entries(handlers)) {
  const arg = ARGS[key] ?? ''
  const started = Date.now()
  try {
    const result = await handler(arg, 'owner')
    const title = result?.model?.title || (result?.image ? 'PNG' : '')
    const ms = Date.now() - started
    if (!title) throw new Error('没有返回卡片模型')
    console.log(`✓ ${key.padEnd(8)} ${String(ms).padStart(6)}ms  ${title}`)
    ok += 1
  } catch (error) {
    console.log(`✗ ${key.padEnd(8)} ${String(Date.now() - started).padStart(6)}ms  ${error.message}`)
    bad += 1
  }
}

console.log(`\n${ok} 成功 / ${bad} 失败`)
process.exit(bad ? 1 : 0)
