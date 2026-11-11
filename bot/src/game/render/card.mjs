/**
 * 把「结果数据」渲染成卡片 HTML，同时算出画布尺寸。
 *
 * 视觉按 docs/UI设计规范.md 重做（亮色优先、零光效）：
 * - 浅灰底 #f4f6f8 + 纯白卡片，卡片与底色之间只靠 1px 边框分界
 * - 没有氛围光、没有渐变条、没有彩色阴影、没有毛玻璃
 * - 小节标题 = 5×20 主色竖条 + 19px 标题 + 底部 1px 分隔线 + 右侧灰字
 * - 层级只靠字号 / 字重 / 三档文字色（text / text-dim / text-mute）
 * - 胜绿、负红、金只给名次与 MVP，四色都从变量来，组件里零颜色字面量
 *
 * 卡片模型：
 * {
 *   theme: 'kog' | 'pubg' | 'val' | 'common',
 *   mode: 'light' | 'dark',   // 可选，默认 light
 *   eyebrow, title, subtitle, tags, icon,
 *   stats: [{ label, value, note, tone: 'win'|'lose'|'accent' }],
 *   sections: [{ title, hint, kind: 'chips'|'rows'|'grid'|'image'|'banner'|'figure', ... }],
 *   note, footer, footerLeft
 * }
 * rows 元素：{ main, sub, right(可带 <span class="k">), pill: '胜利', tone: 'win'|'lose'|'flat'|'gold',
 *              icon: dataUrl, me: true }
 * grid 元素：{ src: dataUrl, label, sub }
 */
import { CANVAS_W, H, PAD_X, columnsFor, gridLayout, rowHeight, rowsHeight, wrapChips } from './layout.mjs'
import { styleVars, themeOf } from './themes.mjs'
import { GAME_ICONS, iconOfEmoji, iconSvg } from './icons.mjs'

const esc = text =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

function hexAlpha(hex, alpha) {
  const value = String(hex || '#3550b5').replace('#', '')
  const full = value.length === 3 ? value.split('').map(c => c + c).join('') : value
  const int = parseInt(full, 16) || 0x3550b5
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`
}

/** 带胜负胶囊的 main 行：文本 + 胶囊排在一行，超出省略 */
function mainHtml(row) {
  const text = `<span class="main-text">${esc(row.main)}</span>`
  const tone = ['win', 'lose', 'flat', 'gold'].includes(row.tone) ? row.tone : ''
  // 没有明确胜负语义但标记了「这是我」时，用中性胶囊占据同一位置
  const label = row.pill || (row.me ? '我' : '')
  if (!label) return text
  const cls = row.pill ? ` ${tone}` : ' me-pill'
  return text + `<span class="pill${cls}">${esc(label)}</span>`
}

/*
 * CSS 里只允许出现 var(--…)，颜色一律来自 themes.mjs 注入的变量串。
 * 圆角只有 16 / 14 / 12 / 8 / 999 五档，边框只有 --line 一个颜色。
 */
const CSS = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  html, body { background: var(--bg); }
  body {
    width: ${CANVAS_W}px;
    font-family: "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", system-ui, sans-serif;
    color: var(--text);
    font-variant-numeric: tabular-nums;
    -webkit-font-smoothing: antialiased;
  }
  .num { font-variant-numeric: tabular-nums; letter-spacing: -.2px; }
  .page {
    width: ${CANVAS_W}px;
    background: var(--bg);
    padding: ${H.padTop}px ${PAD_X}px ${H.padBottom}px;
  }

  /* ---------- 头部 ---------- */
  header { display: flex; align-items: center; gap: 18px; }
  .badge {
    width: 56px; height: 56px; flex: 0 0 56px; border-radius: 14px;
    display: flex; align-items: center; justify-content: center;
    color: var(--accent);
    background: var(--panel); border: 1px solid var(--line);
  }
  .badge svg { width: 28px; height: 28px; display: block; }
  .head-text { flex: 1; min-width: 0; }
  .eyebrow {
    height: ${H.eyebrow}px; line-height: ${H.eyebrow}px;
    font-size: 12px; letter-spacing: 2.2px; text-transform: uppercase;
    color: var(--text-mute); font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  h1 {
    height: ${H.title}px; line-height: ${H.title}px;
    font-size: 30px; font-weight: 800; letter-spacing: -.3px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .sub-line { height: ${H.subtitle}px; display: flex; align-items: center; gap: 10px; min-width: 0; }
  .sub {
    font-size: 14px; color: var(--text-dim);
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tag {
    flex: 0 0 auto; font-size: 11.5px; font-weight: 600; letter-spacing: .4px;
    padding: 2px 9px; border-radius: 8px;
    color: var(--accent); background: var(--accent-soft); border: 1px solid var(--accent-line);
  }

  /* ---------- 数值卡 ---------- */
  .stats { display: grid; gap: ${H.statGap}px; }
  .stat {
    border-radius: 12px; padding: 14px 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    display: flex; flex-direction: column; justify-content: center;
  }
  /* 三行（label / value / note）合计比格子高时，flex 会把 value 压成 0 高，
     所以显式禁止收缩；格子高度在下面 cellH 里保证够用 */
  .stat > div { flex: 0 0 auto; }
  .stat .label { font-size: 12px; color: var(--text-mute); letter-spacing: .3px; line-height: 15px; }
  .stat .value {
    font-size: 25px; font-weight: 800; color: var(--text); margin-top: 3px;
    line-height: 30px; font-variant-numeric: tabular-nums;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .stat .value.tone-win { color: var(--win); }
  .stat .value.tone-lose { color: var(--lose); }
  .stat .value.tone-accent { color: var(--accent); }
  .stat .note { font-size: 11px; color: var(--text-mute); margin-top: 3px; line-height: 16px; }

  /* ---------- 小节（主色竖条 + 标题 + 底部 1px 分隔线 + 右侧补充） ---------- */
  .section-title {
    height: ${H.sectionTitle}px; margin-bottom: ${H.sectionGap}px;
    display: flex; align-items: center; gap: 12px;
    border-bottom: 1px solid var(--line);
  }
  .section-title .bar { width: 5px; height: 20px; background: var(--accent); flex: 0 0 5px; border-radius: 1px; }
  .section-title .txt { font-size: 19px; font-weight: 700; letter-spacing: .2px; color: var(--text); white-space: nowrap; }
  .section-title .gap { flex: 1; height: 1px; }
  .section-title .hint { font-size: 12px; color: var(--text-mute); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* ---------- chips ---------- */
  .chip-line { display: flex; gap: ${H.chipGap}px; height: ${H.chip}px; margin-bottom: ${H.chipGap}px; }
  .chip {
    height: ${H.chip}px; line-height: ${H.chip - 2}px; padding: 0 12px;
    font-family: ui-monospace, "SF Mono", "JetBrains Mono", Menlo, monospace; font-size: 14.5px;
    color: var(--text-dim); background: var(--panel);
    border: 1px solid var(--line); border-radius: 8px;
    white-space: nowrap;
  }
  .chip.hot { color: var(--accent); background: var(--accent-soft); border-color: var(--accent-line); }

  /* ---------- 对局列表（一行一卡） ---------- */
  .row-card {
    display: flex; align-items: center; gap: 16px;
    padding: 0 16px;
    background: var(--panel);
    border: 1px solid var(--line);
    border-radius: 12px;
  }
  /* 行间距用相邻兄弟，不用 margin-bottom：最后一个行卡后面是页脚，
     :last-child 命中不了，会多出 8px 让整页高度算不准 */
  .row-card + .row-card { margin-top: ${H.rowGap}px; }
  .row-card .idx {
    flex: 0 0 22px; font-size: 12.5px; color: var(--text-mute);
    font-variant-numeric: tabular-nums;
  }
  .row-card .icon {
    flex: 0 0 30px; width: 30px; height: 30px; border-radius: 8px; overflow: hidden;
    background: var(--panel-2); border: 1px solid var(--line);
  }
  .row-card .icon img { width: 100%; height: 100%; object-fit: cover; display: block; }
  /* 枪械图标是长条形，等比缩放才看得清；白剪影（掌瓦）要深色托板，黑枪白底要浅托板 */
  .row-card .icon.contain {
    flex: 0 0 66px; width: 66px; height: 36px; border-radius: 8px; padding: 3px 4px;
  }
  .row-card .icon.contain img { object-fit: contain; }
  .row-card .icon.contain.light { background: var(--panel-2); }
  .row-card .icon.contain.dark { background: var(--icon-plate-dark); border-color: var(--icon-plate-dark); }
  .row-card .body { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: ${H.rowInnerGap}px; }
  .row-card .main {
    font-size: 15px; font-weight: 600; color: var(--text); line-height: ${H.rowMain}px;
    display: flex; align-items: center; gap: 8px; min-width: 0;
  }
  .row-card .main-text { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .row-card .sub {
    font-size: 12.5px; color: var(--text-dim); line-height: ${H.rowSub}px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .row-card .right {
    flex: 0 0 auto; text-align: right; font-size: 13px; color: var(--text-mute);
    font-variant-numeric: tabular-nums; white-space: nowrap;
  }
  .row-card .right .k { color: var(--text); font-weight: 700; font-size: 15px; }
  .row-card .right .ico { display: inline-flex; align-items: center; }
  .row-card .right .ico svg { width: 17px; height: 17px; display: block; }
  .row-card .right .ico.win { color: var(--win); }
  .row-card .right .ico.lose { color: var(--lose); }
  .row-card .right .ico.mute { color: var(--text-mute); }
  /* 自己那一行：整行 accent 7% 底 + 同色系描边，不画阴影 */
  .row-card.me { background: var(--accent-soft); border-color: var(--accent-line); }
  .row-card .pill.me-pill { color: var(--accent); background: var(--panel); border-color: var(--accent-line); }

  /* ---------- 带图网格（英雄 / 特工 / 地图 / 皮肤） ---------- */
  .grid { display: grid; }
  .tile { display: flex; flex-direction: column; min-width: 0; }
  .tile .ph {
    width: 100%; border-radius: 12px; overflow: hidden;
    background: var(--panel-2);
    border: 1px solid var(--line);
  }
  .tile .ph img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .tile .cap {
    display: flex; align-items: baseline; gap: 6px;
    font-size: 12.5px; color: var(--text); font-weight: 600;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
    padding-top: 5px; height: ${H.gridLabel}px; line-height: 16px;
  }
  .tile .cap i { font-style: normal; font-size: 11px; color: var(--text-mute); font-weight: 500; }
  .tile .cap-sub {
    font-size: 11px; color: var(--text-mute); height: ${H.gridLabelSub}px; line-height: 14px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .tile .ph.empty {
    display: flex; align-items: center; justify-content: center;
    font-size: 20px; font-weight: 800; color: var(--text-mute);
  }

  /* ---------- 胶囊：胜负 / 平局 / MVP ---------- */
  .pill {
    flex: 0 0 auto; font-size: 11.5px; font-weight: 700; letter-spacing: .6px;
    padding: 2px 9px; border-radius: 999px; line-height: 16px;
    border: 1px solid transparent;
  }
  .pill.win { color: var(--win); background: var(--win-soft); border-color: var(--win-line); }
  .pill.lose { color: var(--lose); background: var(--lose-soft); border-color: var(--lose-line); }
  .pill.flat { color: var(--flat); background: var(--flat-soft); border-color: var(--flat-line); }
  .pill.gold { color: var(--gold); background: var(--gold-soft); border-color: var(--gold-line); }

  /* ---------- 图片 / 提示 / 页脚 ---------- */
  .image-wrap { display: flex; justify-content: center; padding: 4px 0 8px; }
  .image-wrap img { image-rendering: pixelated; border-radius: 12px; background: var(--panel); padding: 8px; border: 1px solid var(--line); }

  /* 地图横幅：图片铺满 + 底部纯白遮罩上叠文字（功能性遮罩，不是光效） */
  .banner {
    position: relative; width: 100%; border-radius: 14px; overflow: hidden;
    background: var(--panel-2); margin-bottom: 12px;
    border: 1px solid var(--line);
  }
  .banner img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .banner-cap {
    position: absolute; left: 0; right: 0; bottom: 0;
    padding: 28px 18px 14px;
    display: flex; align-items: baseline; gap: 10px;
    background: linear-gradient(180deg, transparent, var(--mask-to));
  }
  .banner-cap b { font-size: 21px; font-weight: 800; color: var(--text); letter-spacing: .3px; }
  .banner-cap span { font-size: 13px; color: var(--text-dim); }

  /* 图文卡：左边一张方形图（地图 / 特工），右边大数值 + 说明行 */
  .fig { display: flex; gap: 20px; align-items: stretch; }
  .fig .pic {
    flex: 0 0 auto; border-radius: 14px; overflow: hidden;
    background: var(--panel-2); border: 1px solid var(--line);
  }
  .fig .pic img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .fig .info { flex: 1; min-width: 0; display: flex; flex-direction: column; justify-content: center; gap: 9px; }
  .fig .big { font-size: 40px; font-weight: 800; line-height: 1; letter-spacing: -.5px; color: var(--text); font-variant-numeric: tabular-nums; }
  .fig .big.win { color: var(--win); }
  .fig .big.lose { color: var(--lose); }
  .fig .line {
    font-size: 13.5px; color: var(--text-dim); line-height: 19px;
    white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
  .fig .line b { color: var(--text); font-weight: 700; }
  .fig .tags { display: flex; gap: 8px; flex-wrap: wrap; }
  .fig .tags span {
    font-size: 11.5px; font-weight: 600; letter-spacing: .4px;
    padding: 3px 9px; border-radius: 8px;
    color: var(--accent); background: var(--accent-soft); border: 1px solid var(--accent-line);
  }

  .note {
    min-height: ${H.note}px; display: flex; align-items: center;
    font-size: 13px; color: var(--text-dim); line-height: 1.5;
  }
  footer {
    height: ${H.footer}px; display: flex; align-items: center; justify-content: space-between;
    border-top: 1px solid var(--line);
    font-size: 12px; color: var(--text-mute);
  }
  footer .brand { letter-spacing: .3px; color: var(--text-dim); }
`

function varsOf(model) {
  const theme = themeOf(model.theme, model.mode || 'light')
  // 卡片可以自己指定主色（同一主题下不同语义色），软底与描边跟着主色推
  if (model.accent && model.accent !== theme.accent) {
    return {
      ...theme,
      accent: model.accent,
      accentSoft: hexAlpha(model.accent, theme.mode === 'dark' ? 0.16 : 0.07),
      accentLine: hexAlpha(model.accent, theme.mode === 'dark' ? 0.35 : 0.25)
    }
  }
  return theme
}

export function cardHtml(model) {
  const theme = varsOf(model)
  // 徽标：优先显式图标名，其次模型里的 emoji（翻译成图标），兜底按主题给游戏图标
  const badgeIcon = model.icon || iconOfEmoji(model.emoji) || GAME_ICONS[model.theme] || ''

  let height = H.padTop + H.eyebrow + H.title
  if (model.subtitle || model.tags?.length) height += H.subtitle
  height += H.headerGap

  /* ---- stats ---- */
  let statsHtml = ''
  if (model.stats?.length) {
    const cols = columnsFor(model.stats.length, 3)
    const rows = Math.ceil(model.stats.length / cols)
    // 同组内要么都带 note 要么都不带，高度才齐
    const withNote = model.stats.some(s => s.note)
    const cellH = withNote ? H.statCellNote : H.statCell
    height += rows * cellH + (rows - 1) * H.statGap + H.headerGap
    statsHtml = `<div class="stats" style="grid-template-columns:repeat(${cols},1fr)">${model.stats
      .map(s => {
        const tone = ['win', 'lose', 'accent'].includes(s.tone) ? ` tone-${s.tone}` : ''
        return `<div class="stat" style="height:${cellH}px">
          <div class="label">${esc(s.label)}</div>
          <div class="value${tone}">${esc(s.value)}</div>
          ${withNote ? `<div class="note">${s.note ? esc(s.note) : ''}</div>` : ''}
        </div>`
      })
      .join('')}</div>
    <div style="height:${H.headerGap}px"></div>`
  }

  /* ---- sections ---- */
  const sectionsHtml = (model.sections || [])
    .map((section, sectionIndex) => {
      let html = ''
      // 有图块（figure / banner）前面没有小节标题兜着，紧跟数值卡时会贴在一起，这里补一段留白
      const gapBefore =
        ['figure', 'banner'].includes(section.kind) && (sectionIndex > 0 || model.stats?.length) ? H.blockGap : 0
      if (gapBefore) {
        height += gapBefore
        html += `<div style="height:${gapBefore}px"></div>`
      }
      // figure / grid / banner / image 是「有图的内容块」，它们的 title 字段不是小节标题
      const titled = ['chips', 'rows', undefined].includes(section.kind) && (section.title || section.hint)
      if (titled) {
        // 紧跟在数值卡或上一块后面的标题，上面要留一口气，否则会贴在前一块上
        const topGap = sectionIndex > 0 || model.stats?.length ? H.sectionTop : 0
        if (topGap) {
          height += topGap
          html += `<div style="height:${topGap}px"></div>`
        }
        // 40 是标题本身，14 是分隔线与内容之间的留白（CSS 里的 margin-bottom）
        height += H.sectionTitle + H.sectionGap
        html += `<div class="section-title">
          <span class="bar"></span>
          ${section.title ? `<span class="txt">${esc(section.title)}</span>` : ''}
          <span class="gap"></span>
          ${section.hint ? `<span class="hint">${esc(section.hint)}</span>` : ''}
        </div>`
      } else if (!['figure', 'grid', 'banner', 'image'].includes(section.kind)) {
        height += 14
        html += '<div style="height:14px"></div>'
      }

      if (section.kind === 'chips') {
        const lines = wrapChips(section.chips || [])
        height += lines.length * (H.chip + H.chipGap)
        html += lines
          .map(
            line =>
              `<div class="chip-line">${line
                .map(i => `<span class="chip${section.hot ? ' hot' : ''}">${esc(section.chips[i])}</span>`)
                .join('')}</div>`
          )
          .join('')
      }

      if (section.kind === 'rows') {
        const rows = section.rows || []
        height += rowsHeight(rows)
        html += rows
          .map((row, i) => {
            const lead = row.icon
              ? `<div class="icon${row.iconFit === 'contain' ? ' contain' : ''}${
                  row.iconPlate === 'light' ? ' light' : row.iconPlate === 'dark' ? ' dark' : ''
                }"><img src="${row.icon}" alt="" /></div>`
              : section.indexed === false
                ? ''
                : `<div class="idx">${i + 1}</div>`
            return `<div class="row-card${row.me ? ' me' : ''}" style="height:${rowHeight(row)}px">
              ${lead}
              <div class="body">
                <div class="main">${mainHtml(row)}</div>
                ${row.sub ? `<div class="sub">${esc(row.sub)}</div>` : ''}
              </div>
              ${row.right ? `<div class="right">${row.right}</div>` : ''}
            </div>`
          })
          .join('')
      }

      if (section.kind === 'grid') {
        const items = section.items || []
        const hasSub = items.some(item => item.sub)
        const layout = gridLayout(items.length, {
          columns: section.columns,
          aspect: section.aspect,
          label: H.gridLabel + (hasSub ? H.gridLabelSub : 0)
        })
        height += layout.height
        html += `<div class="grid" style="grid-template-columns:repeat(${layout.columns},${layout.tileW}px);gap:${H.gridRowGap}px ${H.gridColGap}px">${items
          .map(item => {
            const ph = item.src
              ? `<div class="ph" style="height:${layout.tileH}px"><img src="${item.src}" alt="" style="height:${layout.tileH}px" /></div>`
              : `<div class="ph empty" style="height:${layout.tileH}px">${esc((item.label || '?').slice(0, 1))}</div>`
            return `<div class="tile">
              ${ph}
              <div class="cap">${esc(item.label || '')}${item.suffix ? `<i>${esc(item.suffix)}</i>` : ''}</div>
              ${hasSub ? `<div class="cap-sub">${esc(item.sub || '')}</div>` : ''}
            </div>`
          })
          .join('')}</div>`
      }

      if (section.kind === 'banner') {
        const bannerH = section.height || 180
        height += bannerH + 12
        const cap = section.caption
          ? `<div class="banner-cap">${section.caption.main ? `<b>${esc(section.caption.main)}</b>` : ''}${
              section.caption.sub ? `<span>${esc(section.caption.sub)}</span>` : ''
            }</div>`
          : ''
        html += `<div class="banner" style="height:${bannerH}px"><img src="${section.src}" alt="" style="height:${bannerH}px" />${cap}</div>`
      }

      if (section.kind === 'figure') {
        const size = section.size || 190
        height += size + 12
        const tone = ['win', 'lose'].includes(section.tone) ? ` ${section.tone}` : ''
        const pic = section.src
          ? `<div class="pic" style="width:${size}px;height:${size}px"><img src="${section.src}" alt="" /></div>`
          : ''
        html += `<div class="fig" style="height:${size}px;margin-bottom:12px">
          ${pic}
          <div class="info">
            ${section.big ? `<div class="big${tone}">${esc(section.big)}</div>` : ''}
            ${(section.lines || []).map(line => `<div class="line">${line}</div>`).join('')}
            ${
              section.tags?.length
                ? `<div class="tags">${section.tags.map(tag => `<span>${esc(tag)}</span>`).join('')}</div>`
                : ''
            }
          </div>
        </div>`
      }

      if (section.kind === 'image') {
        const imgHeight = section.image?.height || 360
        height += imgHeight + 12
        html += `<div class="image-wrap"><img src="${section.image.src}" style="width:${section.image.width}px;height:${imgHeight}px" /></div>`
      }

      if (section.note) {
        height += H.note
        html += `<div class="note">${esc(section.note)}</div>`
      }

      return html
    })
    .join('')

  if (model.note) height += H.note
  height += H.footer + H.padBottom

  const tagsHtml = (model.tags || []).map(tag => `<span class="tag">${esc(tag)}</span>`).join('')

  const body = `
  <div class="page" style="${styleVars(theme)};width:${CANVAS_W}px;height:${height}px">
    <header>
      ${(badgeIcon ? `<div class="badge">${iconSvg(badgeIcon)}</div>` : '')}
      <div class="head-text">
        <div class="eyebrow">${esc(model.eyebrow || '')}</div>
        <h1>${esc(model.title || '')}</h1>
        ${model.subtitle || model.tags?.length ? `<div class="sub-line">${model.subtitle ? `<span class="sub">${esc(model.subtitle)}</span>` : ''}${tagsHtml}</div>` : ''}
      </div>
    </header>
    <div style="height:${H.headerGap}px"></div>
    ${statsHtml}
    ${sectionsHtml}
    ${model.note ? `<div class="note">${esc(model.note)}</div>` : ''}
    <footer>
      <span>${esc(model.footerLeft || theme.name)}</span>
      <span class="brand">${esc(model.footer || 'game-hub')}</span>
    </footer>
  </div>`

  const html = `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8">
<title>${esc(model.title || 'result')}</title><style>${CSS}</style></head>
<body class="theme-${theme.mode}">${body}</body></html>`

  return { html, width: CANVAS_W, height }
}
