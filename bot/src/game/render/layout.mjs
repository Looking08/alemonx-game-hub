/**
 * 尺寸计算常量与文字宽度估算。
 *
 * 一次性截图拿不到 scrollHeight，画布高度必须先在这里算准，
 * CSS 里的行高 / 内边距与这些常量一一对应，改一处必须同步另一处。
 *
 * 画布 1180 宽，对齐 docs/UI设计规范.md：容器内边距 32 36 26。
 */
export const CANVAS_W = 1180
export const PAD_X = 36
export const INNER_W = CANVAS_W - PAD_X * 2

export const H = {
  padTop: 32,
  eyebrow: 18,
  title: 46,
  subtitle: 24,
  headerGap: 24,
  /** 数值卡：上下内边距 14*2 + label 15 + value(3+30) = 76 */
  statCell: 76,
  /** 带 note 的数值卡多一行 3+16 */
  statCellNote: 95,
  statGap: 10,
  /** 小节标题：19px 文字 + 上下留白 + 底部 1px 分隔线 */
  sectionTitle: 40,
  /** 小节标题（分隔线）与下方内容之间的留白 */
  sectionGap: 14,
  /** 小节标题上方的留白（紧跟在别的区块后面时才需要） */
  sectionTop: 12,
  chip: 36,
  chipGap: 8,
  /** 行卡内部：main 行 / sub 行 / 上下留白 / 行间 gap */
  rowMain: 22,
  rowSub: 18,
  rowInnerGap: 4,
  rowPadY: 12,
  rowLine: 2,
  rowGap: 8,
  /** 有图内容块（figure / banner）之间的留白 */
  blockGap: 24,
  /** 网格瓷砖：图 + 标签，列间距 / 行间距 / 标签行高 */
  gridColGap: 12,
  gridRowGap: 14,
  gridLabel: 20,
  gridLabelSub: 16,
  footer: 52,
  note: 40,
  /** 容器内边距的下沿，页脚与画布底之间留这么多 */
  padBottom: 26
}

/** 行卡总高：只有 main 一行 / main + sub 两行 */
export const ROW_H = {
  plain: H.rowPadY * 2 + H.rowMain + H.rowLine,
  sub: H.rowPadY * 2 + H.rowMain + H.rowInnerGap + H.rowSub + H.rowLine
}

export function rowHeight(row) {
  return row?.sub ? ROW_H.sub : ROW_H.plain
}

/** n 行卡片列表的总高（含行间 gap，末行不带） */
export function rowsHeight(rows) {
  const list = rows || []
  if (!list.length) return 0
  return list.reduce((sum, row) => sum + rowHeight(row), 0) + (list.length - 1) * H.rowGap
}

/**
 * 估算一段文字的渲染宽度（px）。
 * CJK 约 1em，大写 0.68，数字 0.58，小写 0.56，其余 0.5。
 */
export function measure(text, size = 15) {
  let width = 0
  for (const ch of String(text ?? '')) {
    if (/[\u2e80-\u9fff\u3000-\u303f\uff00-\uffef]/.test(ch)) width += 1
    else if (/[A-Z]/.test(ch)) width += 0.68
    else if (/[0-9]/.test(ch)) width += 0.58
    else if (/[a-z]/.test(ch)) width += 0.56
    else width += 0.5
  }
  return width * size
}

/** 把一批 chip 文案按宽度拆成多行下标 */
export function wrapChips(labels, size = 15, maxWidth = INNER_W) {
  const lines = []
  let line = []
  let width = 0
  ;(labels || []).forEach((label, index) => {
    // chip 自身有 10px 左右内边距
    const w = measure(label, size) + 20
    if (line.length && width + w + H.chipGap > maxWidth) {
      lines.push(line)
      line = []
      width = 0
    }
    line.push(index)
    width += w + H.chipGap
  })
  if (line.length) lines.push(line)
  return lines
}

/** n 个 stat 摆几列（最多 max 列） */
export function columnsFor(count, max = 3) {
  const n = Number(count) || 1
  if (n <= max) return Math.max(n, 1)
  return max
}

/**
 * 带图网格（英雄 / 特工 / 地图 / 皮肤）的尺寸。
 *
 * CSS 侧用 `grid-template-columns: repeat(cols, tileWpx)` + `gap: rowGap colGap`，
 * 所以总高 = rows * (tileH + label) + (rows - 1) * rowGap。
 * aspect 是「高 / 宽」：方形头像 1，竖版皮肤 1.47。
 */
export function gridLayout(count, { columns = 6, aspect = 1, label, maxWidth = INNER_W } = {}) {
  const n = Math.max(1, Number(count) || 1)
  // 列数按调用方给的走，**不按结果数收缩**：只命中 1 个英雄时也要保持小头像，
  // 否则单张图会被拉到整幅宽。
  const cols = Math.max(1, Number(columns) || 1)
  const tileW = Math.floor((maxWidth - (cols - 1) * H.gridColGap) / cols)
  const tileH = Math.round(tileW * aspect)
  const labelH = label ?? H.gridLabel
  const rows = Math.ceil(n / cols)
  const cellH = tileH + labelH
  return {
    columns: cols,
    tileW,
    tileH,
    label: labelH,
    rows,
    cellH,
    height: rows * cellH + (rows - 1) * H.gridRowGap
  }
}
