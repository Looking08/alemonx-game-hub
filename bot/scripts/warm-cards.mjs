/**
 * 预热卡片缓存 + 测量渲染耗时。
 *
 * 为什么要预热：Chrome 冷启动一张要接近 20 秒，用户发第一条指令要干等。
 * 预渲染把 html 哈希对应的 PNG 落到 render/cache/，运行时命中就是几毫秒。
 * 公共卡片（英雄列表、瓦地图、瓦英雄、帮助、错误提示）所有人共用同一份缓存。
 */
import fs from 'node:fs'
import * as cards from '../src/game/cards.mjs'
import { cardHtml } from '../src/game/render/card.mjs'
import { renderHtmlToPng, closeRenderer } from '../src/game/render/shot.mjs'
import { helpModel, pingModel, helloModel, statusModel } from '../src/game/cards-response.mjs'

const OUT = '/tmp/cards/warm'
fs.mkdirSync(OUT, { recursive: true })

const tasks = [
  ['heroes-all', () => cards.heroesCard('')],
  ['heroes-kw', () => cards.heroesCard('猴')],
  ['hero-skins', () => cards.heroSkinsCard('小乔')],
  ['power', () => cards.powerCard('孙悟空')],
  ['kog-profile', () => cards.kogProfileCard('owner')],
  ['kog-matches', () => cards.kogMatchesCard('owner')],
  ['pubg-profile', () => cards.pubgProfileCard('owner')],
  ['pubg-recent', () => cards.pubgRecentCard('owner')],
  ['pubg-weapons', () => cards.pubgWeaponsCard('owner')],
  ['pubg-honor', () => cards.pubgHonorCard('owner')],
  ['pubg-weekly', () => cards.pubgWeeklyCard('owner')],
  ['val-agents', () => cards.valAgentsCard('')],
  ['val-maps', () => cards.valMapsCard('owner')],
  ['val-maps-public', () => cards.valMapsCard('qq:10000')],
  ['val-panel', () => cards.valPanelCard('owner', 'panel')],
  ['val-battles', () => cards.valPanelCard('owner', 'battles')],
  ['val-match', () => cards.valMatchDetailCard('owner', 1)],
  ['val-peers', () => cards.valPeersCard('owner', 1)],
  ['val-weapons', () => cards.valWeaponsCard('owner', '')],
  ['val-agents-perf', () => cards.valAgentsPerfCard('owner')],
  ['status-owner', () => cards.statusCard('owner')],
  ['status-guest', () => cards.statusCard('qq:10000')],
  ['unbind-usage', () => cards.unbindCard('owner', '')],
  ['unbind-kog', () => cards.unbindCard('qq:10000', '王者')],
  ['error-notlogin', () => cards.errorCard('尚未登录', '没有找到这个 QQ 名下的王者营地凭证', ['营地登录', '和平登录', '瓦登录'])],
  ['error-fail', () => cards.errorCard('查询失败', '营地接口返回异常：登录态失效')],
  ['login-timeout', () => cards.loginResultCard('kog', 'timeout', '二维码已过期，请重新发送「营地登录」')],
  ['login-success', () => cards.loginResultCard('kog', 'success', '眸藏泪')],
  ['resp-help', () => ({ model: helpModel() })],
  ['resp-ping', () => ({ model: pingModel() })],
  ['resp-hello', () => ({ model: helloModel('自检') })],
  ['resp-status', () => ({ model: statusModel() })]
]

function scale(text) {
  return text.replace(/\x1b\[[0-9;]*m/g, '')
}

let ok = 0
let fail = 0
const slow = []

for (const [name, make] of tasks) {
  const t0 = Date.now()
  try {
    const payload = await make()
    let model = payload
    if (payload && payload.model) model = payload.model
    if (!model) throw new Error('没有拿到卡片模型')
    const { html, width, height } = cardHtml(model)
    const format = model.png ? 'png' : 'jpeg'
    const png = await renderHtmlToPng(html, { width, height, format })
    const ext = format === 'png' ? 'png' : 'jpg'
    fs.writeFileSync(`${OUT}/${name}.${ext}`, png)
    const ms = Date.now() - t0
    ok += 1
    if (ms > 3000) slow.push(`${name} ${ms}ms`)
    console.log(`✓ ${name.padEnd(14)} ${width}×${height}  ${(png.length / 1024).toFixed(0)}KB ${format}  ${ms}ms`)
  } catch (error) {
    fail += 1
    const ms = Date.now() - t0
    console.log(`✗ ${name.padEnd(14)} ${ms}ms  ${scale(error?.message || String(error)).slice(0, 90)}`)
  }
}

console.log(`\n完成：${ok} 成功 / ${fail} 失败`)
if (slow.length) console.log('慢的：', slow.join(' | '))

// 长驻浏览器不关掉的话，事件循环不会退出，脚本跑完也会挂着
await closeRenderer()
