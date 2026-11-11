/* 游戏中心面板：只跟 ALX 宿主同源的 /api/v1/setup/plugins/<id>/... 打交道 */
const PLUGIN_ID = 'game-hub'
const BASE = `/api/v1/setup/plugins/${PLUGIN_ID}`

const state = {
  games: [],
  active: '',
  busy: false,
  loginTimer: null
}

/* ---------------- 宿主调用 ---------------- */

// ?demo=1 时用内置样例数据渲染，便于截图/无宿主环境下预览布局
const DEMO_PARAMS = new URLSearchParams(location.search)
const DEMO = DEMO_PARAMS.has('demo')
const DEMO_ACTION = DEMO_PARAMS.get('action')

const DEMO_DATA = {
  status: {
    output: '✓ 示例数据',
    data: {
      version: '0.1.0',
      games: [
        {
          id: 'kog',
          name: '王者荣耀',
          upstream: 'https://gitee.com/Tloml-Starry/GloryOfKings-Plugin',
          loginHint: '微信 / QQ 扫码登录营地（不抓包）',
          loginChannels: ['wx', 'qq'],
          publicQueries: ['英雄列表', '英雄战力', '英雄皮肤'],
          privateQueries: ['主页概览', '最近战绩'],
          loggedIn: true,
          account: { userId: '123456789', nickname: '示例玩家', savedAt: '2026-11-01T14:00:00Z' }
        },
        {
          id: 'pubg',
          name: '和平精英',
          upstream: 'https://github.com/TciFurh/PUBG-Helper-Plugin',
          loginHint: '微信 / QQ 扫码登录和平营地',
          loginChannels: ['wx', 'qq'],
          publicQueries: [],
          privateQueries: ['角色卡', '最近战绩'],
          loggedIn: false,
          account: null
        },
        {
          id: 'val',
          name: '无畏契约',
          upstream: 'https://github.com/Looking08/Valorant-Plugin',
          loginHint: '微信 / QQ 扫码登录掌瓦',
          loginChannels: ['wx', 'qq'],
          publicQueries: ['英雄资料', '地图列表'],
          privateQueries: ['个人面板', '最近战绩'],
          loggedIn: false,
          account: null
        }
      ]
    }
  },
  'kog.heroes': {
    output: '✓ 示例数据',
    data: {
      items: [
        { id: 105, name: '廉颇', type: '坦克' },
        { id: 106, name: '小乔', type: '法师' },
        { id: 107, name: '赵云', type: '战士' },
        { id: 131, name: '李白', type: '刺客' },
        { id: 141, name: '貂蝉', type: '法师' }
      ]
    }
  },
  'kog.power': {
    output: '✓ 示例数据',
    data: {
      hero: '李白',
      items: [
        { platform: '安卓QQ', province: '澳门', provincePower: '8534', city: '伊春市', cityPower: '5247', district: '岑岭县', districtPower: '1353', guobiao: '12706', updatedAt: '2026/10/31 05:34' },
        { platform: '安卓微信', province: '澳门', provincePower: '7954', city: '大庆市', cityPower: '5012', district: '肇州县', districtPower: '1288', guobiao: '11902', updatedAt: '2026/10/31 05:34' }
      ]
    }
  },
  'pubg.profile': {
    output: '✓ 示例数据',
    data: {
      nickname: '示例玩家',
      rank: '钻石 V',
      kd: 2.14,
      matches: 1860,
      winRate: '11.3%',
      top10Rate: '42.7%'
    }
  },
  'val.agents': {
    output: '✓ 示例数据',
    data: {
      items: [
        { name: '捷风', role: '决斗者' },
        { name: '炼狱', role: '控场者' },
        { name: '猎枭', role: '先锋' },
        { name: '贤者', role: '哨卫' }
      ]
    }
  }
}

async function readJson(res) {
  const text = await res.text()
  if (!text) return {}
  try {
    return JSON.parse(text)
  } catch {
    return { error: text.slice(0, 200) }
  }
}

async function getStatus() {
  return callAction('status', {})
}

async function waitTask(taskId) {
  const deadline = Date.now() + 180_000
  while (Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 700))
    const res = await fetch('/api/v1/robot/tasks', { credentials: 'include' })
    const list = await readJson(res)
    const items = Array.isArray(list) ? list : list.items || list.tasks || []
    const hit = items.find(t => String(t.id ?? t.taskId ?? t.ID ?? '') === String(taskId))
    if (!hit) continue
    const status = String(hit.status || hit.state || '')
    if (status === 'completed' || status === 'failed' || status === 'success' || status === 'error') {
      // 宿主把 output / data 直接挂在任务对象上
      return hit
    }
  }
  throw new Error('操作超时（任务 3 分钟未完成）')
}

async function callAction(action, params = {}) {
  if (DEMO) {
    if (DEMO_DATA[action]) return DEMO_DATA[action]
    return { output: '✓ 示例数据（demo 模式不请求宿主）', data: {} }
  }
  const res = await fetch(`${BASE}/actions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ action, confirm: false, params })
  })
  const body = await readJson(res)

  if (res.status === 202) {
    const taskId = body?.task?.id ?? body?.taskId ?? body?.id
    if (taskId !== undefined) return waitTask(taskId)
    return body
  }
  return body
}

/* ---------------- 渲染工具 ---------------- */

const el = (tag, cls, text) => {
  const node = document.createElement(tag)
  if (cls) node.className = cls
  if (text !== undefined) node.textContent = text
  return node
}

function toast(message) {
  const node = el('div', 'toast show', message)
  document.body.appendChild(node)
  setTimeout(() => node.classList.remove('show'), 1800)
  setTimeout(() => node.remove(), 2200)
}

function renderResult(container, result) {
  container.innerHTML = ''
  if (!result) {
    container.appendChild(el('div', 'empty', '还没有查询结果'))
    return
  }
  if (result.error) {
    const box = el('div', 'card')
    box.appendChild(el('h3', null, '执行失败'))
    box.appendChild(el('div', null, result.error))
    container.appendChild(box)
    return
  }
  if (result.output) {
    const p = el('p', null, result.output)
    p.style.fontSize = '12.5px'
    p.style.color = 'var(--muted)'
    p.style.margin = '0 0 10px'
    container.appendChild(p)
  }

  const data = result.data
  if (!data) return

  if (Array.isArray(data.items) && data.items.length) {
    if (data.items[0].icon || data.items[0].avatar) {
      const grid = el('div', 'grid-cards')
      data.items.forEach(item => {
        const card = el('div', 'mini')
        const name = item.name || item.nickname || ''
        const src = item.icon || item.avatar || ''
        // 图标缺失或加载失败时退回名字首字，避免出现灰块
        const fallback = () => el('div', 'mini-fallback', name.slice(0, 1) || '?')
        if (src) {
          const img = el('img')
          img.src = src
          img.alt = name
          img.loading = 'lazy'
          img.addEventListener('error', () => img.replaceWith(fallback()))
          card.appendChild(img)
        } else {
          card.appendChild(fallback())
        }
        card.appendChild(el('strong', null, name))
        card.appendChild(el('span', null, item.role || item.title || ''))
        grid.appendChild(card)
      })
      container.appendChild(grid)
      return
    }

    const wrap = el('div', 'table-wrap')
    const table = el('table')
    const columns = Object.keys(data.items[0]).filter(k => k !== 'raw').slice(0, 8)
    const thead = el('thead')
    const hrow = el('tr')
    columns.forEach(c => hrow.appendChild(el('th', null, COLUMN_LABELS[c] || c)))
    thead.appendChild(hrow)
    table.appendChild(thead)
    const tbody = el('tbody')
    data.items.forEach(item => {
      const row = el('tr')
      columns.forEach(c => {
        const value = item[c]
        row.appendChild(el('td', null, Array.isArray(value) ? value.join(' / ') : String(value ?? '')))
      })
      tbody.appendChild(row)
    })
    table.appendChild(tbody)
    wrap.appendChild(table)
    container.appendChild(wrap)
    return
  }

  if (typeof data === 'object') {
    const keys = Object.keys(data)
    const flat = keys.length > 0 && keys.every(k => {
      const v = data[k]
      return v === null || ['string', 'number', 'boolean'].includes(typeof v)
    })

    // 扁平对象（角色卡、主页概览）用键值表展示，比裸 JSON 好看
    if (flat) {
      const kv = el('dl', 'kv wide')
      keys.forEach(k => {
        kv.appendChild(el('dt', null, COLUMN_LABELS[k] || k))
        kv.appendChild(el('dd', null, data[k] === null ? '—' : String(data[k])))
      })
      container.appendChild(kv)
      return
    }

    const pre = el('pre', null, JSON.stringify(data, null, 2))
    container.appendChild(pre)
  }
}

/* ---------------- 面板构建 ---------------- */

const QUERY_DEFS = {
  kog: [
    { action: 'kog.heroes', label: '英雄列表', desc: '营地全英雄清单，免登录直连', needLogin: false },
    { action: 'kog.skins', label: '英雄皮肤', desc: '某个英雄的全部皮肤原画', input: '英雄名，如 小乔', needLogin: false },
    { action: 'kog.power', label: '查战力', desc: '四平台省 / 市 / 区县与国标战力', input: '英雄名，如 李白', needLogin: false },
    { action: 'kog.profile', label: '主页概览', desc: '段位、战力与常用英雄', input: '营地 ID（留空用登录账号）', needLogin: true },
    { action: 'kog.matches', label: '最近战绩', desc: '最近对局列表与胜负', input: '营地 ID（留空用登录账号）', needLogin: true },
    { action: 'kog.battleDetail', label: '对局详情', desc: '单局十人数据：英雄、皮肤、KDA、评分', params: { index: 1 }, needLogin: true }
  ],
  pubg: [
    { action: 'pubg.profile', label: '角色卡', desc: '昵称、段位、KD 与场次统计', needLogin: true },
    { action: 'pubg.recent', label: '最近战绩', desc: '最近对局明细与排名', needLogin: true },
    { action: 'pubg.battleDetail', label: '对局详情', desc: '单局地图、队伍、击杀与物资', params: { index: 1 }, needLogin: true },
    { action: 'pubg.weapons', label: '枪械熟练度', desc: '每把枪的等级、击杀、命中与爆头', needLogin: true },
    { action: 'pubg.honor', label: '王牌印记', desc: '最高段位、印记墙与收金纪录', needLogin: true },
    { action: 'pubg.weekly', label: '周报', desc: '本周场次、吃鸡、前十与积分变化', needLogin: true }
  ],
  val: [
    { action: 'val.agents', label: '英雄资料', desc: '特工技能与定位（公开数据）', needLogin: false },
    { action: 'val.maps', label: '地图列表', desc: '全部地图与点位缩略图', needLogin: false },
    { action: 'val.panel', label: '个人面板', desc: '段位、胜率与最近对局', needLogin: true },
    { action: 'val.matchDetail', label: '对局详情', desc: '单局比分与十人 ACS 明细', params: { index: 1 }, needLogin: true },
    { action: 'val.peers', label: '同场玩家', desc: '这一局十个人的段位与伤害', params: { index: 1 }, needLogin: true },
    { action: 'val.weapons', label: '枪械熟练度', desc: '本赛季各枪械击杀、爆头与射程', needLogin: true },
    { action: 'val.agentsPerf', label: '特工熟练度', desc: '各特工场次、胜率与 K/D', needLogin: true },
    { action: 'val.mapsPerf', label: '地图熟练度', desc: '各张地图的胜率与 K/D', needLogin: true }
  ]
}

// 表格列名中文化，未命中的列直接显示原字段
const COLUMN_LABELS = {
  platform: '平台',
  province: '省份',
  provincePower: '省战力',
  city: '城市',
  cityPower: '市战力',
  district: '区县',
  districtPower: '区县战力',
  guobiao: '国标',
  updatedAt: '更新于',
  name: '名称',
  hero: '英雄',
  heroId: '英雄 ID',
  id: 'ID',
  title: '称号',
  role: '定位',
  type: '类型',
  desc: '描述',
  map: '地图',
  mode: '模式',
  result: '结果',
  time: '时间',
  nickname: '昵称',
  rank: '段位',
  kd: 'K/D',
  matches: '场次',
  winRate: '吃鸡率',
  top10Rate: '前十率',
  level: '等级',
  power: '战力'
}

function buildPanel(game) {
  const section = el('section', 'panel')
  section.dataset.game = game.id

  /* 左：账号 */
  const left = el('div')
  const accountCard = el('div', 'card')
  accountCard.appendChild(el('h3', null, '账号'))

  const kv = el('dl', 'kv')
  const kvRow = (k, v) => {
    kv.appendChild(el('dt', null, k))
    kv.appendChild(el('dd', null, v))
  }
  kvRow('状态', game.loggedIn ? '已登录' : '未登录')
  if (game.account) {
    kvRow('账号', game.account.nickname || game.account.userId || '—')
    if (game.account.userId) kvRow('ID', game.account.userId)
    if (game.account.savedAt) kvRow('绑定于', String(game.account.savedAt).replace('T', ' ').slice(0, 16))
  }
  kvRow('方式', game.loginHint)
  if (game.account?.channel) kvRow('登录渠道', game.account.channel === 'qq' ? 'QQ' : '微信')
  accountCard.appendChild(kv)

  const actions = el('div', 'actions')
  // 两个渠道并排：不必再猜「扫哪个码」
  const channels = game.loginChannels?.length ? game.loginChannels : ['wx']
  for (const channel of channels) {
    const label = channel === 'qq' ? 'QQ' : '微信'
    const btn = el('button', `btn${channel === channels[0] ? ' primary' : ''}`, `${label}扫码登录`)
    btn.addEventListener('click', () => startLogin(game.id, channel))
    actions.appendChild(btn)
  }

  if (game.loggedIn) {
    const removeBtn = el('button', 'btn ghost', '移除凭证')
    removeBtn.addEventListener('click', async () => {
      const result = await callAction('account.remove', { game: game.id })
      toast(result.output || result.error || '已处理')
      await refresh()
    })
    actions.appendChild(removeBtn)
  }
  accountCard.appendChild(actions)

  const capCard = el('div', 'card')
  capCard.style.marginTop = '14px'
  capCard.appendChild(el('h3', null, '能力'))
  const capList = el('div', 'actions')
  ;[...game.publicQueries.map(q => `${q}（免登录）`), ...game.privateQueries.map(q => `${q}（需登录）`)].forEach(text => {
    capList.appendChild(el('span', 'chip', text))
  })
  capCard.appendChild(capList)

  if (game.upstream) {
    const link = el('a', null, '上游项目')
    link.href = game.upstream
    link.target = '_blank'
    link.rel = 'noreferrer'
    link.style.fontSize = '11.5px'
    link.style.color = 'var(--muted)'
    link.style.display = 'inline-block'
    link.style.marginTop = '10px'
    capCard.appendChild(link)
  }

  left.appendChild(accountCard)
  left.appendChild(capCard)

  /* 右：查询 */
  const right = el('div', 'card')
  right.appendChild(el('h3', null, '查询'))

  const queryGrid = el('div', 'query-grid')
  const resultBox = el('div', 'result')
  resultBox.appendChild(el('div', 'empty', '还没有查询结果，点上面的「查询」试一下'))

  const resultHead = el('div', 'result-head')
  resultHead.appendChild(el('h3', null, '结果'))
  const resultMeta = el('span', null, '')
  resultHead.appendChild(resultMeta)

  const setResult = (label, result) => {
    resultMeta.textContent = result ? label : ''
    renderResult(resultBox, result)
  }

  ;(QUERY_DEFS[game.id] || []).forEach(def => {
    const card = el('div', 'qcard')

    const head = el('div', 'qcard-head')
    head.appendChild(el('strong', null, def.label))
    head.appendChild(el('span', `chip ${def.needLogin ? 'warn' : 'ok'}`, def.needLogin ? '需登录' : '免登录'))
    card.appendChild(head)

    card.appendChild(el('p', 'qcard-desc', def.desc))

    let input = null
    if (def.input) {
      input = el('input', 'q')
      input.type = 'text'
      input.placeholder = def.input
      card.appendChild(input)
    }

    const btn = el('button', 'btn', '查询')
    btn.addEventListener('click', async () => {
      if (state.busy) return
      state.busy = true
      btn.disabled = true
      btn.textContent = '查询中…'
      resultMeta.textContent = `${game.name} · ${def.label}`
      resultBox.innerHTML = ''
      resultBox.appendChild(el('div', 'empty', '正在请求宿主执行…'))
      try {
        const raw = input ? input.value.trim() : ''
        // def.params 是「固定参数」（比如对局详情的 index），输入框有值再覆盖
        const params = { ...(def.params || {}) }
        if (raw) {
          params.hero = raw
          params.id = raw
        }
        const result = await callAction(def.action, params)
        setResult(`${game.name} · ${def.label}`, result)
      } catch (error) {
        setResult(`${game.name} · ${def.label}`, { error: error.message })
      } finally {
        state.busy = false
        btn.disabled = false
        btn.textContent = '查询'
      }
    })
    card.appendChild(btn)

    queryGrid.appendChild(card)
  })

  right.appendChild(queryGrid)
  right.appendChild(resultHead)
  right.appendChild(resultBox)

  section.appendChild(left)
  section.appendChild(right)

  // demo 模式下预填一次结果，方便无宿主预览表格样式
  if (DEMO) {
    const defs = QUERY_DEFS[game.id] || []
    const target = defs.find(d => d.action === DEMO_ACTION) || defs[0]
    if (target) callAction(target.action, {}).then(r => setResult(`${game.name} · ${target.label}`, r))
  }

  return section
}

/* ---------------- 扫码登录 ---------------- */

function closeQr() {
  document.getElementById('qr-modal').hidden = true
  if (state.loginTimer) {
    clearInterval(state.loginTimer)
    state.loginTimer = null
  }
}

async function startLogin(gameId, channel = 'wx') {
  const modal = document.getElementById('qr-modal')
  const image = document.getElementById('qr-image')
  const stateText = document.getElementById('qr-state')
  const title = document.getElementById('qr-title')

  modal.hidden = false
  image.removeAttribute('src')
  stateText.textContent = '正在申请二维码…'

  const channelName = channel === 'qq' ? '手机 QQ' : '微信'

  try {
    const started = await callAction('login.start', { game: gameId, channel })
    if (started?.error) throw new Error(started.error)
    const qr = started?.data?.qr
    if (!qr) throw new Error(started?.output || '没有拿到二维码')

    image.src = qr
    title.textContent = `${started.data.appName || ''} · 用${channelName}扫码`
    stateText.textContent = `等待${channelName}扫码…（约 90 秒内有效）`

    // 宿主是「一次动作 = 一个进程」，扫码等待用单个阻塞动作包住轮询
    const done = await callAction('login.await', {})
    if (done?.status === 'failed' || done?.error) {
      stateText.textContent = done.error || '登录未完成'
      return
    }
    stateText.textContent = '登录成功'
    closeQr()
    toast('登录成功')
    await refresh()
  } catch (error) {
    stateText.textContent = `登录失败：${error.message}`
  }
}

/* ---------------- 骨架 ---------------- */

function renderTabs() {
  const tabs = document.getElementById('tabs')
  tabs.innerHTML = ''
  state.games.forEach(game => {
    const tab = el('button', 'tab')
    tab.type = 'button'
    tab.setAttribute('role', 'tab')
    tab.setAttribute('aria-selected', String(state.active === game.id))
    tab.appendChild(el('span', `dot${game.loggedIn ? ' on' : ''}`))
    tab.appendChild(el('span', null, game.name))
    tab.addEventListener('click', () => {
      state.active = game.id
      renderTabs()
      renderPanels()
    })
    tabs.appendChild(tab)
  })
}

function renderPanels() {
  const host = document.getElementById('panels')
  host.innerHTML = ''
  const game = state.games.find(g => g.id === state.active)
  if (!game) {
    host.appendChild(el('div', 'empty', '没有可用的游戏适配器'))
    return
  }
  host.appendChild(buildPanel(game))
}

async function refresh() {
  const subtitle = document.getElementById('subtitle')
  try {
    const status = await getStatus()
    const data = status?.data || status
    state.games = data.games || []
    if (!state.active && state.games.length) state.active = state.games[0].id
    if (DEMO_ACTION) {
      const hit = state.games.find(g => (QUERY_DEFS[g.id] || []).some(d => d.action === DEMO_ACTION))
      if (hit) state.active = hit.id
    }
    const logged = state.games.filter(g => g.loggedIn).length
    subtitle.textContent = `v${data.version || '0.1.0'} · ${state.games.length} 个游戏 · ${logged} 个已登录`
    renderTabs()
    renderPanels()
  } catch (error) {
    subtitle.textContent = `读取状态失败：${error.message}`
  }
}

document.getElementById('refresh').addEventListener('click', () => refresh())
document.getElementById('qr-close').addEventListener('click', closeQr)

refresh()
