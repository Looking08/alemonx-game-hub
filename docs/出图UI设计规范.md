# Valorant-Plugin 出图 UI 设计规范

> 本文是给 AI / 设计实现者看的完整设计理念与实现约束，读完应能在不看旧代码的情况下
> 从零复现这套出图 UI，或在不破坏设计语言的前提下扩展新页面。
> 配套实现在 `resources/css/base.css`（唯一全局样式源）+ `resources/html/*.html`（art-template 模板）。

---

## 0. 场景约束（先读这个，所有决策都从这里推导）

出图不是网页，是**机器人发到群聊里的静态 JPEG**。这决定了所有设计边界：

| 约束 | 设计后果 |
| --- | --- |
| puppeteer 无头 Chromium 截图，画布固定 `width: 1180px`，纵向不限 | 不做响应式；布局全部固定宽度；高度靠内容自然撑开 |
| 用户在手机上看一张长图，屏幕缩放后细节变小 | 信息层级必须靠字号/字重/留白表达，不能依赖 hover/动画/小色差 |
| 机器人服务器常在 docker / 无外网环境 | **禁止一切外部资源**：无 CDN、无 webfont、无外链图标；CSS/字体全部自包含 |
| docker 镜像普遍没有中文字体 | 必须内置字体（Noto Sans SC 子集，SIL OFL），否则中文渲染成豆腐块 □□□，且数字英文正常、极难发现 |
| 一次出图 = 一次真实用户数据查询 | 页面要「一图一问」：每张图回答一个问题（面板=概览、详情=一局、枪械=熟练度） |

---

## 1. 四条核心理念（按优先级排序，冲突时序号小的赢）

### ① 亮色优先，深色是可选主题

默认主题是**亮色**：浅灰底 + 纯白卡片 + 深灰蓝文字。
理由：群聊里手机屏幕在白底背景图上看得更清楚，且多数聊天软件是浅色界面，亮色图不打断阅读流。

- 深色主题（`render.theme: dark`）是**等价选项**，不是二等公民：完整恢复 VALORANT 客户端配色（`#0f1923` 底 + `#ff4655` 红 + `#19e5a0` 青绿）。
- 两套主题**只差 CSS 变量**，组件结构、间距、字号完全共享。禁止出现「只在某个主题下存在」的组件规则。

### ② 分区靠边框、分隔线和留白，不靠光

数据区块之间的边界表达，**只允许三种手段**：

1. **1px 实色边框**（卡片与底色的分界）；
2. **section 标题下的分隔线**（`.section-title { border-bottom: 1px solid var(--line) }`）；
3. **留白**（区块间距 24px 级别）。

### ③ 零光特效（这是硬约束，不是风格偏好）

明确**禁止**的效果，理由是机器截图场景里光效会放大 JPEG 压缩噪点、拖慢渲染、并在缩放后糊成一片：

| 禁止项 | 具体形式 |
| --- | --- |
| 光晕 | `radial-gradient` 做的装饰性光斑、角部氛围光 |
| 发光阴影 | `box-shadow` 带颜色的（发光）、大面积投影 |
| 渐变条 | 用 `linear-gradient` 给进度条/徽章/按钮上色 |
| 毛玻璃 | `backdrop-filter: blur(...)` |
| 文字光 | `text-shadow`、`filter: drop-shadow` |

**唯一例外**（功能性，不是装饰）：hero 区的 `--hero-mask` 渐变遮罩——背景图上盖一层不透明度递减的纯色，保证文字可读。它是「遮罩」不是「光」：颜色是纯白（亮色）/纯深蓝黑（深色），没有彩色。

### ④ 层级靠字号、字重和颜色深浅，不靠装饰

- 标签：12–13px，`--text-mute`（浅）；
- 正文：14px，`--text-dim`；
- 数值（主角）：25px+，`--text`，**加粗**，等宽数字；
- 强调：只用语义色（胜绿/负红/金），**不用图标闪烁、不用底色大面积铺**。

---

## 2. 色彩系统

### 2.1 为什么强调红是 #d8354a 不是 #ff4655

VALORANT 官方红 `#ff4655` 在白底上的对比度只有约 3.5:1，压深到 `#d8354a` 后 ≥ 4.5:1（WCAG AA 正文级）。
**规则**：官方色进亮色主题前必须过对比度校验（正文文字 ≥4.5:1，大号数字 ≥3:1）；深色主题底色暗，可直接用官方原色。

### 2.2 亮色主题（默认，`:root`）

```css
:root {
  /* 底 / 卡片 */
  --bg: #f4f6f8;            /* 页面底：冷灰白 */
  --bg-soft: #eef1f4;       /* 更深一档的底（行内强调块） */
  --panel: #ffffff;         /* 卡片：纯白，不透明 */
  --panel-2: #f0f3f6;       /* 卡片内的浅灰块（badge/进度条底） */
  --line: #e3e7ec;          /* 所有边框和分隔线，全站唯一 */
  /* 字（三档深度，禁止更多档位） */
  --text: #1c2733;          /* 正文/数值 */
  --text-dim: #5c6b7a;      /* 次要说明 */
  --text-mute: #8b97a3;     /* 标签/单位 */
  /* 语义色 */
  --accent: #d8354a;        /* 强调红（官方红压深） */
  --accent-soft: rgba(216, 53, 74, 0.07);   /* 强调红的 7% 底色（self 行高亮等） */
  --accent-line: rgba(216, 53, 74, 0.25);   /* 强调红的描边 */
  --win:  #0f9d6c;          /* 胜/正向 */
  --win-soft: rgba(15, 157, 108, 0.10);    /* 胜利标签底色 */
  --lose: #d8354a;          /* 负/失败 */
  --lose-soft: rgba(216, 53, 74, 0.10);
  --gold: #b07d1a;          /* 金（MVP/名次），也是压深后的官方金 */
  /* hero 区 */
  --hero-bg-opacity: 0.10;      /* 首页 hero 背景图浓度：图只做纹理 */
  --hero-detail-opacity: 0.16;  /* 详情页 hero：地图原画多露一点 */
  --hero-mask: linear-gradient(90deg,
    rgba(255,255,255,0.96) 32%,
    rgba(255,255,255,0.72) 72%,
    rgba(255,255,255,0.45));    /* 功能性可读遮罩：左浓右淡，文字在左 */
  --dot-blue: #0d8db8;          /* 队伍色点（蓝队，压深版） */
  --dot-red: #d8354a;
  /* 背景图纱（亮色=白纱） */
  --veil-rgb: 255, 255, 255;
  --bg-img: none;               /* 由渲染层注入 */
  --bg-veil: 0;                 /* 由渲染层注入 */
}
```

### 2.3 深色主题（`body.theme-dark`，只覆盖变量）

```css
body.theme-dark {
  --bg: #0f1923;  --bg-soft: #16232e;  --panel: #1b2a37;  --panel-2: #22333f;
  --line: #2b3d4c;
  --text: #ece8e1;  --text-dim: #8b9aa7;  --text-mute: #5f7180;
  --accent: #ff4655;  --accent-soft: rgba(255,70,85,0.16);  --accent-line: rgba(255,70,85,0.35);
  --win: #19e5a0;  --win-soft: rgba(25,229,160,0.14);
  --lose: #ff4655;  --lose-soft: rgba(255,70,85,0.14);
  --gold: #f5d67b;
  --hero-bg-opacity: 0.32;  --hero-detail-opacity: 0.5;
  --hero-mask: linear-gradient(90deg,
    rgba(11,20,28,0.94) 32%, rgba(11,20,28,0.55) 72%, rgba(11,20,28,0.2));
  --dot-blue: #22c3e6;  --dot-red: #ff4655;
  --veil-rgb: 15, 25, 35;   /* 深色主题下背景图盖深纱 */
}
```

### 2.4 用色规则

- **每个颜色只有一个入口**：组件里不允许出现 `#xxxxxx` 字面量，一律 `var(--…)`（两套主题才能靠改变量切换）。
- **soft 系列永远和主色同源**：`--win-soft` 是 `--win` 的低透明度版，不许出现独立的浅绿。
- 红蓝对抗类元素（回合条、队伍点）用 `--dot-blue / --dot-red`，不用 accent，避免「强调红」和「红队红」语义混淆。
- 金色是「名次/MVP」专用，不参与胜负语义。

---

## 3. 字体与数字

```css
font-family: 'ValorantCN', 'PingFang SC', 'Microsoft YaHei', 'Noto Sans SC', -apple-system, sans-serif;
```

- `ValorantCN` = 插件内置 Noto Sans SC 子集（400/700 两个 woff2，~2.3MB），**必须内置**（见场景约束）。
- 字号体系（不使用更多档位）：
  - 数值主角：25px（`.stat-value`）/ 26px（`.big`），`font-weight: 800`
  - 页面标题/玩家名：30px，`800`
  - 区块标题：19px，`700`
  - 正文：14–15px；说明文字 12–13px；最小 11px（kv-label），**不允许再小**
- 行高 `1.5`；中文优先，禁止把中文排成 nowrap 长条。
- **数字必须等宽**：

```css
.num { font-family: 'DIN Alternate', 'Bahnschrift', 'Helvetica Neue', Arial, sans-serif;
       font-variant-numeric: tabular-nums; }
```

理由：战绩页大量数字列（K/D/ACS…），比例数字会导致列不对齐，观感「数据错了」。

---

## 4. 布局与组件

### 4.1 骨架

- `body` 固定 `width: 1180px`；`#container` 内边距 `32px 36px 26px`，**不设背景色**（给背景图系统留穿透）。
- 圆角档位：容器卡 16px（hero）→ 常规卡 14px（card/rank）→ 内容块 12px（stat/list/mini）→ 小件 6–8px（badge/chip）→ 胶囊 999px。只有这五档。
- 卡片内边距：常规 18px 20px；数据格 14px 16px；列表行 12px 14px。

### 4.2 组件规范

| 组件 | 规则 |
| --- | --- |
| `.section-title` | 左侧 5×20px 纯色 accent 竖条（`::before`）+ 文字 + 底部 1px 分隔线 + 右侧灰字补充（`small`）。这是「分区」的核心视觉 |
| `.card` / `.stat` / `.list-row` / `.mini-card` | 一律 `var(--panel)` 纯白不透明底 + 1px `var(--line)` 边框，**无阴影** |
| `.hero`（顶部账号条） | 卡片 + 内部两层绝对定位：`hero-bg`（背景图，`opacity: var(--hero-bg-opacity)`）→ `hero-mask`（功能性遮罩）→ 内容层。头像 96px 圆形 accent 3px 描边 |
| 进度条 `.bar / .rr-bar` | 6–8px 高、999px 圆角、底色 `--panel-2`、填充**纯色单色**（win=绿、kill=红），禁止渐变 |
| 胜负标签 `.is-win/.is-lose` | 胶囊形：`--win-soft` 底 + `--win` 字 + 同色系描边。深浅主题各配一对 soft |
| 回合条 `.round-dot` | 16px 方块（进攻方圆形），胜负直接填充 `--win/--accent`，描边同色（不留透明缝隙） |
| 表格 `table.team` | 无斑马纹；「自己」那行用 `--accent-soft` 整行高亮；行分隔 1px `--line`；th 12px 灰字 |
| 空态 `.empty` | 40px 居中灰字一句话，给「下一步该干什么」的提示文案，不画空壳假 UI |

### 4.3 「一图一问」的信息组织

- 面板页：身份条（hero）→ 段位卡 → 4 列核心数据格（K/D、ACS、爆头率…）→ 常用特工（mini 卡横排）→ 常玩地图 → 近期走势（纯色柱状图）。
- 战绩列表：一行一局，左侧地图缩略图 84×48，胜负胶囊 + 模式 + 关键数据 kv 组，右侧时间。
- 详情页：hero 换成比分 + 地图原画（浓度比首页高），两队伍表格各一段，「我」行高亮、队友加灰色左色条区分。
- 列表默认 10 条、上限 30（群刷屏保护）；特工默认 top5；枪械默认 20——**每个列表都要有上限，出图是给手机看的**。

---

## 5. 背景图系统（用户自定义皮肤）

设计目标：**往 `resources/bg/` 丢一张图就能当背景**，不改代码、不重启。

```
body {
  background-color: var(--bg);
  background-image:
    linear-gradient(rgba(var(--veil-rgb), var(--bg-veil)), rgba(var(--veil-rgb), var(--bg-veil))),  /* 纱 */
    var(--bg-img);                                  /* 用户图，cover 铺满 */
}
```

- **纱（veil）**：盖在图上的一层主题色半透明，浓度 0–1（默认 0.72），亮色主题白纱、深色主题深纱（`--veil-rgb`）。作用是把任意图片的对比度压到文字可读的范围——所以**任何图都直接可用**，不需要用户做图。
- **卡片永远不透明**：背景图只在页面留白、卡片间隙处透出来。这是可读性优先的选择：不为「图更明显」牺牲数据对比度，也因此不需要毛玻璃。
- 注入协议：渲染层检测到背景图时，往模板 `<head>` 内联一行
  `:root{--bg-img:url('../bg/xxx.jpg');--bg-veil:0.72}`；**没有图时什么都不注入**（veil 不注入，避免给纯色底错误蒙灰）。
- URL 必须写成相对 base.css 的 `../bg/…`：`--bg-img` 被 CSS 消费，Chrome 按 CSS 文件所在目录解析 url()，写 HTML 相对路径会静默 404（不报错、图就是不出现，极难排查）。
- 选图逻辑：每次出图重扫目录（新图即时生效）；`render.background: all`（随机）/ `false`（关闭）/ `'reyna.jpg'`（固定，后缀可省）；指定了但找不到时**不回退随机**，老实不显示——否则用户会以为配置没生效。

---

## 6. 主题架构（给实现者）

```
config.yaml → render.theme: light|dark
              └→ utils/render.js 注入 themeClass → <body class="theme-dark">
              render.background / render.veil
              └→ utils/render.js 注入 viewStyle → <head><style>{{@viewStyle}}</style>
resources/css/base.css = :root（亮色变量）+ 组件规则（全用变量）+ body.theme-dark（深色变量覆盖）
```

三条铁律：

1. **变量单源**：所有颜色/遮罩/浓度都是变量，组件规则零字面量。加新主题=加一段 `body.theme-x` 变量覆盖，加新组件=只用既有变量。
2. **注入最小化**：模板侧只认识 `{{@viewStyle}}` 和 `{{themeClass}}` 两个口子，动态内容不散落在模板里。
3. **主题与背景图正交**：任何主题 × 有/无背景图，四种组合都必须成立（纱颜色由 `--veil-rgb` 跟随主题解决）。

配置面（锅巴面板 / yaml 三键）：`render.theme`、`render.background`、`render.veil`。写配置只动这三个键，用户注释保留，fs.watch 热更新。

---

## 7. 反例清单（改 UI 时的自检）

改动提交前逐条对照，任何一条命中就打回：

- [ ] 出现了 `radial-gradient`（非遮罩用途）/ 彩色 `box-shadow` / `text-shadow` / `backdrop-filter` / `drop-shadow`
- [ ] 进度条、徽章、按钮出现 `linear-gradient` 上色
- [ ] 组件里出现颜色字面量而不是 `var(--…)`
- [ ] 亮色主题白底上出现了对比度 <4.5:1 的文字色（如直接用 #ff4655）
- [ ] 卡片变成半透明（背景图应该从间隙透出，而不是透过卡片）
- [ ] 新增了边框颜色（只能用 `--line`）或新的圆角档位
- [ ] 数字没挂 `.num`（等宽）导致列不对齐
- [ ] 引入了外部资源（CDN / webfont / 远程图标）
- [ ] 列表没有上限、或一页塞进两个主题以上的信息密度
