/**
 * 版式预览：用合成数据把每一种区块都画一遍，不依赖任何游戏账号。
 *   node scripts/preview-ui.mjs
 * 产出 preview/ui-*.jpg
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { cardHtml } from '../src/game/render/card.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const OUT = path.join(HERE, '..', 'preview')
fs.mkdirSync(OUT, { recursive: true })

/** 灰色占位图，避免预览依赖外网 */
function ph(w, h, fill, label) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}">
    <rect width="100%" height="100%" fill="${fill}"/>
    <text x="50%" y="50%" fill="#ffffff" font-size="${Math.round(h / 6)}" font-family="sans-serif"
      text-anchor="middle" dominant-baseline="middle">${label}</text>
  </svg>`
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

const MODELS = {
  'ui-detail': {
    theme: 'val',
    eyebrow: '对局详情 · 第 2/10 局',
    title: '无畏契约 · 莲华古城',
    subtitle: '竞技模式 · 38:24 · 2026-11-10 22:14',
    stats: [
      { label: '结果', value: '胜利', tone: 'win' },
      { label: '我方 KDA', value: '58 / 44', tone: 'win' },
      { label: '敌方 KDA', value: '44 / 58', tone: 'lose' },
      { label: '我的 ACS', value: '276' },
      { label: '全场排名', value: '第 2 名', tone: 'accent' },
      { label: '首杀', value: '4', note: '对方 2' }
    ],
    sections: [
      {
        kind: 'figure',
        src: ph(600, 600, '#4a5568', 'MAP'),
        size: 180,
        tone: 'win',
        big: '13 : 9',
        lines: ['结果：<b>胜利</b>　我方 <b>进攻方</b>', '我的评价：<b>S</b> 全场最佳', '我的 KDA <b>24/12/6</b>　ACS <b>276</b>'],
        tags: ['全场第 2 名', '四杀 ×1']
      },
      {
        title: '我方 · 进攻方',
        hint: '58 杀 / 8420 伤害',
        kind: 'rows',
        indexed: false,
        rows: [
          { icon: ph(60, 60, '#d8354a', '捷'), main: '捷风 · 苦橘甘来', sub: '24 / 12 / 6 · ACS 276 · 爆头 32%', right: '<span class="k">S</span>', me: true, pill: '我' },
          { icon: ph(60, 60, '#4a5568', '雷'), main: '雷兹 · 队友甲', sub: '18 / 14 / 4 · ACS 214 · 爆头 21%', right: '<span class="k">A</span>' },
          { icon: ph(60, 60, '#4a5568', '贤'), main: '贤者 · 队友乙', sub: '9 / 15 / 11 · ACS 148 · 爆头 12%', right: '<span class="k">B</span>' }
        ]
      },
      {
        title: '敌方 · 防守方',
        hint: '44 杀 / 6310 伤害',
        kind: 'rows',
        indexed: false,
        rows: [
          { icon: ph(60, 60, '#22333f', '蝰'), main: '蝰蛇 · 对手甲', sub: '19 / 16 / 3 · ACS 221', right: '<span class="k">A</span>', pill: '胜', tone: 'win' },
          { icon: ph(60, 60, '#22333f', '奇'), main: '奇乐 · 对手乙', sub: '11 / 18 / 5 · ACS 152', right: '<span class="k">C</span>', pill: '负', tone: 'lose' }
        ]
      }
    ],
    note: '掌瓦数据有 1~2 小时延迟；发「瓦详细2」换一局看。',
    footer: '瓦详细2 · 共 10 局'
  },

  'ui-banner': {
    theme: 'pubg',
    eyebrow: '对局详情 · 第 1/10 局',
    title: '和平精英 · 米拉玛',
    subtitle: '第三人称四排 · 32 分钟 · 第 1 名',
    sections: [
      {
        kind: 'banner',
        src: ph(1200, 400, '#6b7f4a', 'MIRAMAR'),
        height: 220,
        caption: { main: '第 1 名 · 吃鸡', sub: '第三人称四排 · 32 分钟' }
      }
    ],
    stats: [
      { label: '名次', value: '#1', tone: 'win' },
      { label: '淘汰', value: '9' },
      { label: '伤害', value: '1248' },
      { label: '助攻', value: '3' },
      { label: '存活', value: '32:10' },
      { label: '参赛', value: '25 队', note: '剩余 1 队' }
    ],
    sections2: null,
    note: '本局吃鸡！',
    footer: '和平详细1 · 共 10 局'
  },

  'ui-grid': {
    theme: 'kog',
    eyebrow: '王者荣耀 · 英雄',
    title: '全部 132 位英雄',
    subtitle: '按名称排序，发「英雄列表 猴」可以筛',
    sections: [
      { kind: 'chips', title: '快速筛选', hint: '点击或直接发指令', chips: ['坦克', '战士', '刺客', '法师', '射手', '辅助'], hot: false },
      {
        kind: 'grid',
        columns: 8,
        items: Array.from({ length: 16 }, (_, i) => ({
          src: ph(200, 200, i % 3 === 0 ? '#b07d1a' : '#8b97a3', `H${i + 1}`),
          label: `英雄${i + 1}`,
          suffix: i % 2 ? '刺客' : '法师'
        }))
      }
    ],
    footer: '英雄列表 · 共 132 位'
  },

  'ui-qr': {
    theme: 'common',
    eyebrow: '扫码登录 · 微信通道',
    title: '用微信扫码',
    subtitle: '60 秒内有效，扫完不用再发指令',
    sections: [
      {
        kind: 'image',
        image: { src: ph(320, 320, '#1c2733', 'QR'), width: 320, height: 320 }
      }
    ],
    note: '扫完请在小窗里点「登录」，机器人会自动回一张结果卡。',
    footer: '营地登录 微信'
  },

  'ui-chips': {
    theme: 'common',
    eyebrow: 'mybot · 未识别的指令',
    title: '这条指令我没认出来',
    subtitle: '指令名前缀 / # ! 都可以，也可以直接发指令名',
    sections: [
      { kind: 'chips', title: '你可能想发', hint: '点一下复制', chips: ['游戏帮助', '瓦详细1', '王者详细1', '和平详细1'], hot: true }
    ],
    footer: '游戏帮助'
  }
}

const { renderHtmlToPng, closeRenderer } = await import('../src/game/render/shot.mjs')

for (const [name, model] of Object.entries(MODELS)) {
  if (model.sections2 === null) delete model.sections2
  const { html, width, height } = cardHtml(model)
  const buf = await renderHtmlToPng(html, { width, height })
  const file = path.join(OUT, `${name}.jpg`)
  fs.writeFileSync(file, buf)
  console.log(`${file}  ${width}x${height}  ${(buf.length / 1024).toFixed(0)}KB`)
}

await closeRenderer()
