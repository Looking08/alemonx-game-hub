/**
 * 菜单的 HTML 版式（840px 宽海报，亮色卡片风，与结果图同一套色板）。
 *
 * 因为用 Chrome 的一次性截图（无法自动量高度），这里按「固定画幅」设计：
 * 每个菜单有确定的画布高度，HTML 用 flex 把内容铺满，底部信息靠 margin-top:auto 压到最下面。
 * 内容变多时调 canvasOf 里的高度即可。
 */
import { COMMON, GAMES, TIPS } from './data.mjs'
import { GAME_ICONS, iconSvg } from '../render/icons.mjs'

/**
 * 每张海报的画幅（2 倍图后是 1680 × 2H）。
 * 内容变多时改这里 —— 截图画幅是固定的，写小了会被裁掉。
 */
const CANVAS = {
  help: [840, 1000],
  kog: [840, 1026],
  pubg: [840, 938],
  val: [840, 1108]
}

export function canvasOf(name) {
  return CANVAS[name] || [840, 1000]
}

const BASE_CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }

  /* 与卡片同一套色板：亮色底 + 纯白卡 + 1px 边框，零光效 */
  :root {
    --bg: #f4f6f8;
    --panel: #ffffff;
    --panel-2: #f0f3f6;
    --line: #e3e7ec;
    --text: #1c2733;
    --text-dim: #5c6b7a;
    --text-mute: #8b97a3;
    --win: #0f9d6c;
    --win-soft: rgba(15,157,108,.10);
    --win-line: rgba(15,157,108,.26);
    --qq: #0d8db8;
    --qq-soft: rgba(13,141,184,.10);
    --qq-line: rgba(13,141,184,.26);
    --accent: #3550b5;
    --accent-soft: rgba(53,80,181,.07);
    --accent-line: rgba(53,80,181,.25);
  }

  html, body { background: var(--bg); }
  body {
    width: 840px;
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }
  .page {
    min-height: var(--canvas, 1000px);
    display: flex; flex-direction: column;
    padding: 44px 40px 32px;
    background: var(--bg);
  }

  header { margin-bottom: 24px; }
  .eyebrow {
    font-size: 12px; letter-spacing: 3px; text-transform: uppercase;
    color: var(--text-mute); font-weight: 600; margin-bottom: 12px;
  }
  h1 { font-size: 40px; font-weight: 800; letter-spacing: -1px; line-height: 1.14; }
  h1 .thin { color: var(--text-mute); font-weight: 500; }
  .sub { margin-top: 12px; font-size: 15px; color: var(--text-dim); line-height: 1.6; }

  main { display: flex; flex-direction: column; gap: 14px; }

  .card {
    position: relative; overflow: hidden;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 16px; padding: 20px 22px;
  }
  .card::before {
    content: ""; position: absolute; left: 0; top: 20px; bottom: 20px; width: 4px;
    background: var(--accent);
  }
  .card-head { display: flex; align-items: center; gap: 14px; }
  .badge {
    width: 46px; height: 46px; flex: 0 0 46px; border-radius: 12px;
    display: flex; align-items: center; justify-content: center;
    color: var(--accent);
    background: var(--panel-2);
    border: 1px solid var(--line);
  }
  .badge svg { width: 24px; height: 24px; display: block; }
  .name-row { display: flex; align-items: baseline; gap: 10px; }
  .name { font-size: 21px; font-weight: 700; letter-spacing: -.2px; }
  .source { font-size: 12.5px; color: var(--text-mute); }
  .login { margin-left: auto; display: flex; align-items: center; gap: 9px; }
  .login .label { font-size: 12px; color: var(--text-mute); }

  /* 渠道徽标：微信绿 / QQ 蓝，扫哪个码一眼能分清 */
  .chan {
    display: inline-flex; align-items: center; gap: 6px;
    font-size: 12.5px; font-weight: 600; letter-spacing: .2px;
    padding: 4px 10px 4px 8px; border-radius: 8px;
    border: 1px solid transparent;
  }
  .chan::before { content: ""; width: 7px; height: 7px; border-radius: 50%; }
  .chan.wx { color: var(--win); background: var(--win-soft); border-color: var(--win-line); }
  .chan.wx::before { background: var(--win); }
  .chan.qq { color: var(--qq); background: var(--qq-soft); border-color: var(--qq-line); }
  .chan.qq::before { background: var(--qq); }

  /* 对局详情：菜单里单独抬出来，不跟普通指令混在一行 */
  .card.hero { background: var(--accent-soft); border-color: var(--accent-line); }
  .card.hero .name { font-size: 22px; }
  .card.hero .why { margin-top: 12px; font-size: 13.5px; color: var(--text-dim); line-height: 1.55; }
  .card.hero .cmd { font-size: 15px; }

  .rows { margin-top: 14px; display: flex; flex-direction: column; gap: 10px; }
  .row { display: flex; align-items: center; gap: 12px; }
  .tag {
    flex: 0 0 64px; text-align: center; font-size: 12px; font-weight: 600;
    padding: 4px 0; border-radius: 6px; letter-spacing: .4px;
  }
  .tag.free { color: var(--win); background: var(--win-soft); }
  .tag.auth { color: var(--accent); background: var(--accent-soft); }
  .cmds { display: flex; flex-wrap: wrap; gap: 8px; }

  code, .cmd {
    font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace;
    font-size: 14px; color: var(--text-dim); white-space: nowrap;
    background: var(--panel-2);
    border: 1px solid var(--line);
    border-radius: 8px; padding: 4px 10px;
  }
  .cmd.hot { color: var(--accent); background: var(--accent-soft); border-color: var(--accent-line); }

  .item { display: flex; align-items: baseline; gap: 14px; }
  .item .desc { font-size: 14px; color: var(--text-dim); }

  .section-title {
    display: flex; align-items: center; gap: 12px;
    margin: 6px 0 -1px; font-size: 12.5px; font-weight: 600;
    color: var(--text-mute); letter-spacing: 1.4px;
  }
  .section-title::after { content: ""; flex: 1; height: 1px; background: var(--line); }

  footer {
    margin-top: auto; padding-top: 22px;
    display: flex; align-items: flex-end; justify-content: space-between; gap: 24px;
    border-top: 1px solid var(--line);
  }
  .tips { display: flex; flex-direction: column; gap: 7px; }
  .tip { display: flex; gap: 8px; font-size: 13px; color: var(--text-mute); line-height: 1.5; }
  .tip i { color: var(--text-mute); font-style: normal; }
  .brand { text-align: right; font-size: 12.5px; color: var(--text-mute); white-space: nowrap; letter-spacing: .3px; }
`

/** 卡片左侧色条 / 徽标底色 / 强调 chip 都跟着游戏主色走 */
function gameVars(game) {
  return [
    `--accent:${game.accent}`,
    `--accent-soft:${hexAlpha(game.accent, 0.07)}`,
    `--accent-line:${hexAlpha(game.accent, 0.25)}`
  ].join(';')
}

const ACCENT_BLUE = '--accent:#3550b5;--accent-soft:rgba(53,80,181,.07);--accent-line:rgba(53,80,181,.25)'

function hexAlpha(hex, alpha) {
  const value = hex.replace('#', '')
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value
  const int = parseInt(full, 16)
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`
}

const esc = text => String(text).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const tipsHtml = () => TIPS.map(t => `<div class="tip"><i>·</i><span>${esc(t)}</span></div>`).join('')

function page(title, body, name) {
  const [width, height] = canvasOf(name)
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><title>${esc(title)}</title>
<style>${BASE_CSS}</style></head>
<body><div class="page" style="--canvas:${height}px;width:${width}px">
${body}
</div></body></html>`
}

/** 一级菜单：游戏帮助 → 三个游戏 + 通用 */
export function level1Html() {
  const cards = GAMES.map(game => `
    <section class="card" style="${gameVars(game)}">
      <div class="card-head">
        <div class="badge">${iconSvg(GAME_ICONS[game.id] || 'gear')}</div>
        <div>
          <div class="name-row">
            <span class="name">${esc(game.name)}</span>
            <span class="source">${esc(game.source)}</span>
          </div>
        </div>
        <div class="login">
          <span class="cmd hot">${esc(game.login[0])}</span>
          ${game.channels.map(c => `<span class="chan ${c.key}">${esc(c.label)}</span>`).join('')}
        </div>
      </div>
      <div class="rows">
        ${game.publicQueries.length
          ? `<div class="row"><span class="tag free">免登录</span><span class="cmds">${game.publicQueries
              .map(q => `<code>${esc(q.cmd)}</code>`)
              .join('')}</span></div>`
          : ''}
        <div class="row"><span class="tag auth">需登录</span><span class="cmds">${game.privateQueries
          .map(q => `<code${q.hero ? ' class="hot"' : ''}>${esc(q.cmd)}</code>`)
          .join('')}</span></div>
      </div>
    </section>`).join('')

  const common = `
    <section class="card" style="${ACCENT_BLUE}">
      <div class="card-head">
        <div class="badge">${iconSvg('gear')}</div>
        <div><div class="name-row"><span class="name">${esc(COMMON.title)}</span></div></div>
        <div class="login"><span class="label">随时可用</span></div>
      </div>
      <div class="rows">
        <div class="row">
          <span class="tag free">通用</span>
          <span class="cmds">${COMMON.items.map(item => `<code>${esc(item.cmd)}</code>`).join('')}</span>
        </div>
      </div>
    </section>`

  return page('游戏帮助', `
    <header>
      <div class="eyebrow">Game Hub · 3 款游戏 · 微信 / QQ 双通道</div>
      <h1>游戏帮助 <span class="thin">/ 指令总览</span></h1>
      <p class="sub">登录分微信和 QQ 两条通道，扫哪个码就发哪个。想看单局就用「游戏名 + 详细 + 局号」，比如 瓦详细2。</p>
    </header>
    <main>
      ${cards}
      ${common}
    </main>
    <footer>
      <div class="tips">${tipsHtml()}</div>
      <div class="brand">王者帮助 · 和平帮助 · 瓦帮助</div>
    </footer>`, 'help')
}

/** 二级菜单：单个游戏的完整指令 */
export function level2Html(game) {
  const publicSection = game.publicQueries.length
    ? `
    <div class="section-title">免登录也能查</div>
    <section class="card" style="${gameVars(game)}">
      <div class="rows" style="margin-top:0">
        ${game.publicQueries
          .map(
            q => `<div class="item">
              <span class="cmd hot">${esc(q.sample || q.cmd)}</span>
              <span class="desc">${esc(q.desc)}</span>
            </div>`
          )
          .join('')}
      </div>
    </section>`
    : ''

  /* 对局详情单独一张卡：它是这一屏最值得用的功能，不能混在列表里 */
  const hero = game.privateQueries.find(q => q.hero)
  const rest = game.privateQueries.filter(q => !q.hero)

  const heroSection = hero
    ? `
    <section class="card hero" style="${gameVars(game)}">
      <div class="card-head">
        <div class="badge">${iconSvg('folder')}</div>
        <div><div class="name-row"><span class="name">${esc(game.detailWord || '对局详细')}</span><span class="source">看某一局的完整数据</span></div></div>
        <div class="login"><span class="cmd hot">${esc(hero.cmd)}</span></div>
      </div>
      <div class="why">${esc(hero.desc)}　·　末尾数字就是第几局：${esc(game.detailWord || '对局详细')}2 看倒数第二局</div>
    </section>`
    : ''

  const privateSection = `
    <div class="section-title">登录后才能查</div>
    <section class="card" style="${gameVars(game)}">
      <div class="rows" style="margin-top:0">
        ${rest
          .map(
            q => `<div class="item">
              <span class="cmd hot">${esc(q.sample || q.cmd)}</span>
              <span class="desc">${esc(q.desc)}</span>
            </div>`
          )
          .join('')}
      </div>
    </section>`

  const loginCard = `
    <section class="card" style="${gameVars(game)}">
      <div class="card-head">
        <div class="badge">${iconSvg('key')}</div>
        <div><div class="name-row"><span class="name">扫码登录</span><span class="source">二维码直接发在聊天里</span></div></div>
      </div>
      <div class="rows">
        ${game.channels
          .map(
            c => `<div class="row">
              <span class="chan ${c.key}">${esc(c.label)}</span>
              <span class="cmds"><span class="cmd hot">${esc(c.cmd)}</span></span>
            </div>`
          )
          .join('')}
      </div>
    </section>`

  return page(`${game.name}帮助`, `
    <header>
      <div class="eyebrow">${esc(game.source)} · 微信 / QQ 双通道</div>
      <h1>${esc(game.name)} <span class="thin">/ 指令</span></h1>
      <p class="sub">登录分两条通道：微信扫「${esc(game.channels[0].cmd)}」，QQ 扫「${esc(game.channels[1].cmd)}」。</p>
    </header>
    <main>
      ${loginCard}
      ${heroSection}
      ${publicSection}
      ${privateSection}
    </main>
    <footer>
      <div class="tips">${tipsHtml()}</div>
      <div class="brand">发「游戏帮助」看全部游戏</div>
    </footer>`, game.id)
}
