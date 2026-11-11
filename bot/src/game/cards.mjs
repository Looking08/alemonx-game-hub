/**
 * 视图层：拉数据 → 组装卡片模型。
 *
 * 每个函数返回 { model, text }：
 *   model 给渲染器画图，text 是渲染失败时兜底的纯文本（保证功能不因为渲染挂了而不可用）。
 */
import { GAME_NAMES, games, store } from './hub.mjs'
import { GAMES, gameById } from './menu/data.mjs'
import { gameIdOf } from './menu.mjs'
import { imgData, imgList } from './render/assets.mjs'
import { iconSvg } from './render/icons.mjs'

/** 亮色主题下的主色：官方色的压深版，白底上过对比度（正文 ≥4.5:1） */
const ACCENT = { kog: '#b07d1a', pubg: '#b45f1d', val: '#d8354a', common: '#3550b5' }
const ICON = { kog: 'crown', pubg: 'parachute', val: 'crosshair', common: 'gear' }

const fit = value => String(value ?? '').replace(/\s+/g, ' ').trim()

/** 卡片里 `.fig .line` 是原样注入的（要用 <b> 上色），所以文本必须自己转义 */
const esc = text =>
  String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')

/** 0.1276 → 12.8%，已经是字符串的（"63.0"）补个百分号 */
function pct(value, digits = 1) {
  const n = Number(value)
  if (!Number.isFinite(n)) return '—'
  if (n > 0 && n <= 1) return `${(n * 100).toFixed(digits)}%`
  return `${n.toFixed(digits)}%`
}

/** 小数保留一位，去掉多余的 .0 */
const dec = (value, digits = 1) => {
  const n = Number(value)
  if (!Number.isFinite(n)) return fit(value) || '—'
  return n.toFixed(digits).replace(/\.0$/, '')
}

/** 对局结果 → 胶囊语义色。先判负（「失败」「负」），再判胜，避免「2胜1负」这类混合文本误判 */
function toneOf(result) {
  const text = fit(result)
  if (!text) return ''
  if (/失败|落败|负$|lose|defeat/i.test(text)) return 'lose'
  if (/胜利|获胜|赢|win/i.test(text)) return 'win'
  if (/平局|平分|draw/i.test(text)) return 'flat'
  return ''
}

const PILL_TEXT = { win: '胜利', lose: '失败', flat: '平局' }

function pick(obj, keys) {
  for (const key of keys) {
    const value = obj?.[key]
    if (value !== undefined && value !== null && value !== '' && typeof value !== 'object') return value
  }
  return ''
}

function fmtTime(ms) {
  if (!ms) return ''
  const date = new Date(Number(ms))
  if (Number.isNaN(date.getTime())) return ''
  const p = n => String(n).padStart(2, '0')
  return `${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`
}

function fmtPercent(value) {
  const text = fit(value)
  if (!text) return ''
  return /%/.test(text) || !/^[\d.]+$/.test(text) ? text : `${text}%`
}

const clip = (text, max) => (text.length > max ? `${text.slice(0, max - 1)}…` : text)

/* ---------------- 王者荣耀 ---------------- */

export async function heroesCard(keyword) {
  const kog = await games.kog()
  const { count, items } = await kog.heroes()
  const kw = String(keyword || '').trim()

  if (kw) {
    const hit = items.filter(
      item => item.name.includes(kw) || (item.title || '').includes(kw) || (item.skins || []).some(s => s.includes(kw))
    )
    if (!hit.length) {
      return {
        model: {
          eyebrow: '王者荣耀 · 英雄',
          title: `没有匹配「${kw}」的英雄`,
          accent: ACCENT.kog,
      theme: 'kog',
          icon: ICON.kog,
          note: '试试「英雄列表」看全名单，或换个关键词。',
          footer: 'game-hub · 英雄列表'
        },
        text: `没有匹配「${kw}」的英雄，试试「英雄列表」看全名单。`
      }
    }
    const icons = await imgList(hit.map(item => item.avatar))
    return {
      model: {
        eyebrow: `王者荣耀 · 搜索「${kw}」`,
        title: `命中 ${hit.length} 位英雄`,
        subtitle: `全服共 ${count} 位 · 发「英雄皮肤 名字」看皮肤`,
        accent: ACCENT.kog,
        theme: 'kog',
        icon: ICON.kog,
        sections: [
          {
            title: '搜索结果',
            kind: 'grid',
            columns: 5,
            aspect: 1,
            items: hit.slice(0, 40).map((item, i) => ({
              src: icons[i],
              label: item.name,
              sub: item.skins.length ? `${item.skins.length} 款皮肤` : ''
            }))
          }
        ],
        footer: '英雄战力 <名字> 查战力'
      },
      text: `【王者英雄搜索：${kw}】命中 ${hit.length} 位（共 ${count} 位）`
    }
  }

  const icons = await imgList(items.map(item => item.avatar))
  return {
    model: {
      eyebrow: '王者荣耀 · 英雄',
      title: `全部 ${count} 位英雄`,
      subtitle: '发「英雄皮肤 名字」看皮肤大图，发「英雄战力 名字」查战力',
      accent: ACCENT.kog,
      theme: 'kog',
      icon: ICON.kog,
      sections: [
        {
          title: '英雄图鉴',
          hint: '按上线顺序',
          kind: 'grid',
          columns: 8,
          aspect: 1,
          items: items.map((item, i) => ({ src: icons[i], label: item.name }))
        }
      ],
      footer: '英雄列表 <关键词> 筛选'
    },
    text: `【王者英雄列表】共 ${count} 位：${items.map(item => item.name).join('、')}`
  }
}

/** 英雄皮肤：竖版皮肤大图 + 皮肤名，序号与皮肤列表一一对应 */
export async function heroSkinsCard(heroName) {
  if (!heroName) {
    return {
      model: {
        eyebrow: '王者荣耀 · 皮肤',
        title: '用法：英雄皮肤 小乔',
        accent: ACCENT.kog,
        theme: 'kog',
        icon: ICON.kog,
        sections: [{ kind: 'chips', chips: ['英雄皮肤 小乔', '英雄皮肤 李白', '英雄皮肤 瑶'] }],
        note: '先发「英雄列表」找英雄名，再加在指令后面。',
        footer: 'game-hub · 英雄皮肤'
      },
      text: '用法：英雄皮肤 小乔'
    }
  }

  const kog = await games.kog()
  const data = await kog.skins(heroName)
  const images = await imgList(data.items.map(item => item.image))
  const avatar = await imgData(data.avatar)

  // 皮肤图是 727×1071 的竖版，一屏放 5 张正好
  const shown = await Promise.all(data.items.slice(0, 15).map(async (item, i) => ({
    src: images[i],
    label: item.name
  })))

  return {
    model: {
      eyebrow: '王者荣耀 · 皮肤',
      title: `${data.hero} · ${data.count} 款皮肤`,
      subtitle: data.title || '含原皮',
      accent: ACCENT.kog,
      theme: 'kog',
      icon: ICON.kog,
      sections: [
        {
          kind: 'figure',
          src: avatar,
          size: 120,
          big: `${data.count} 款`,
          lines: [`英雄：<b>${esc(data.hero)}</b>　${esc(data.title || '')}`, '竖版海报按皮肤上线顺序排列'],
          tags: ['英雄列表', `英雄战力 ${data.hero}`]
        },
        {
          title: '皮肤',
          hint: data.count > 15 ? `先展示前 15 款 / 共 ${data.count} 款` : '按上线顺序',
          kind: 'grid',
          columns: 5,
          aspect: 1.47,
          items: shown
        }
      ],
      footer: 'game-hub · 英雄皮肤'
    },
    text: `【${data.hero}·皮肤】共 ${data.count} 款：${data.items.map(i => i.name).join('、')}`
  }
}

export async function powerCard(heroName) {
  if (!heroName) {
    return {
      model: {
        eyebrow: '王者荣耀 · 战力',
        title: '用法：英雄战力 李白',
        accent: ACCENT.kog,
      theme: 'kog',
        icon: ICON.kog,
        note: '在指令后面加英雄名，例如「英雄战力 猴子」。',
        footer: 'game-hub · 英雄战力'
      },
      text: '用法：英雄战力 李白'
    }
  }

  const kog = await games.kog()
  const { hero, items } = await kog.power(heroName)
  return {
    model: {
      eyebrow: '王者荣耀 · 战力',
      title: `${hero} · 四平台战力`,
      subtitle: '省 / 市 / 区县榜与国标分数',
      accent: ACCENT.kog,
      theme: 'kog',
      icon: ICON.kog,
      sections: [
        {
          title: '各平台',
          kind: 'rows',
          rows: items.map(item => ({
            main: item.platform,
            sub: [item.province && `省 ${item.province} ${item.provincePower}`, item.city && `市 ${item.city} ${item.cityPower}`, item.district && `区 ${item.district} ${item.districtPower}`]
              .filter(Boolean)
              .join(' · '),
            right: item.guobiao ? `<span class="k">${item.guobiao}</span> 国标` : ''
          }))
        }
      ],
      footer: 'game-hub · 英雄战力'
    },
    text: `【${hero}·各区战力】\n` + items.map(i => `${i.platform}：国标 ${i.guobiao || '-'}`).join('\n')
  }
}

export async function kogProfileCard(userKey) {
  const kog = await games.kog()
  const res = await kog.profile(undefined, userKey)
  const data = res?.data || {}
  const role = (data.roleList || [])[0] || {}
  const mods = (data.head?.mods || []).filter(m => fit(m?.name))

  const metric = name => {
    const hit = mods.find(m => fit(m.name).includes(name))
    return hit ? fit(hit.content) : ''
  }

  const stats = [
    { label: '段位', value: fit(role.roleJobName) || fit(role.shortRoleJobName) || '未定级' },
    { label: '等级', value: role.gameLevel ? `${role.gameLevel} 级` : '—' },
    { label: '区服', value: fit(role.roleText || role.areaName) || '—' },
    metric('战斗力') && { label: '战斗力', value: metric('战斗力') },
    metric('总场次') && { label: '总场次', value: metric('总场次') },
    metric('胜率') && { label: '胜率', value: metric('胜率') },
    metric('MVP') && { label: 'MVP', value: metric('MVP') },
    metric('英雄') && { label: '英雄', value: metric('英雄') },
    metric('皮肤') && { label: '皮肤', value: metric('皮肤') }
  ].filter(Boolean)

  return {
    model: {
      eyebrow: '王者荣耀 · 营地',
      title: fit(role.roleName) || '王者主页',
      subtitle: [fit(role.roleText || role.areaName), role.gameLevel && `${role.gameLevel} 级`].filter(Boolean).join(' · '),
      accent: ACCENT.kog,
      theme: 'kog',
      icon: ICON.kog,
      stats,
      footer: 'game-hub · 王者主页'
    },
    text: `【王者营地主页】${fit(role.roleName)}`
  }
}

export async function kogMatchesCard(userKey) {
  const kog = await games.kog()
  const res = await kog.matches(undefined, userKey)
  const list = res?.data?.list || res?.data?.battleList || []

  if (!list.length) {
    return {
      model: {
        eyebrow: '王者荣耀 · 战绩',
        title: '暂无可展示的对局',
        accent: ACCENT.kog,
      theme: 'kog',
        icon: ICON.kog,
        note: '这个号关闭了战绩展示，或最近没有打排位。营地接口本身是通的。',
        footer: 'game-hub · 王者战绩'
      },
      text: '【王者最近战绩】这个号没有可展示的对局。'
    }
  }

  const source = list.slice(0, 12)
  const icons = await imgList(source.map(item => item.heroIcon || ''))
  const rows = source.map((item, index) => {
    const time = fit(pick(item, ['gameTime', 'gametime', 'battleTime', 'startTime', 'time', 'dtEventTime']))
    const hero = fit(pick(item, ['heroName', 'hero_name', 'hero'])) || fit(item?.heroInfo?.name)
    const kills = pick(item, ['killNum', 'killcnt', 'kill', 'kills'])
    const deaths = pick(item, ['deathNum', 'deadcnt', 'death', 'deaths'])
    const assists = pick(item, ['assistNum', 'assistcnt', 'assist', 'assists'])
    const result = fit(pick(item, ['result', 'gameResult', 'gameresult', 'battleResult', 'gradeName']))
    const kda = kills !== '' || deaths !== '' || assists !== '' ? `${kills || 0}/${deaths || 0}/${assists || 0}` : ''
    const tone = toneOf(result)
    return {
      icon: icons[index],
      main: [hero, fit(pick(item, ['mapName', 'map']))].filter(Boolean).join(' · ') || '对局',
      sub: [time, kda && `KDA ${kda}`, fit(item.desc)].filter(Boolean).join(' · '),
      pill: tone ? PILL_TEXT[tone] : '',
      tone,
      right: pick(item, ['gradeGame']) ? `<span class="k">${esc(pick(item, ['gradeGame']))}</span>` : ''
    }
  })

  return {
    model: {
      eyebrow: '王者荣耀 · 战绩',
      title: `最近 ${rows.length} 局`,
      subtitle: `共取到 ${list.length} 条记录 · 发「王者详细1」看第一局明细`,
      accent: ACCENT.kog,
      theme: 'kog',
      icon: ICON.kog,
      sections: [{ title: '对局', kind: 'rows', rows }],
      footer: 'game-hub · 王者战绩'
    },
    text: `【王者最近战绩】共 ${list.length} 局`
  }
}

/**
 * 王者单局详情。
 *
 * 数据来自 /game/battledetail：head（结果/地图/模式）+ battle（时长）+ 双方 team 汇总 +
 * redRoles / blueRoles（每人 basicInfo / battleRecords.usedHero.usedSkin / battleStats）。
 * 该号如果关闭了战绩展示，列表是空的，这里会直接抛出「没有可查看的对局」。
 */
export async function kogBattleDetailCard(userKey, index) {
  const kog = await games.kog()
  const d = await kog.battleDetail(userKey, index)
  const tone = d.victory ? 'win' : 'lose'

  const toRows = async players => {
    const icons = await imgList(players.map(player => player.icon || ''))
    return players.map((player, i) => ({
      icon: icons[i],
      main: player.hero || player.name || '玩家',
      sub: [player.name, player.skin, [player.kills, player.deaths, player.assists].filter(v => v !== '').join('/')]
        .filter(Boolean)
        .join(' · '),
      right: player.grade ? `<span class="k">${esc(player.grade)}</span>` : ''
    }))
  }

  const [myRows, enemyRows] = await Promise.all([toRows(d.myPlayers), toRows(d.enemyPlayers)])

  return {
    model: {
      eyebrow: `对局详情 · 第 ${d.index}/${d.total} 局`,
      title: `王者荣耀 · ${d.mapName || '对局'}`,
      subtitle: [d.mode, d.duration, d.startTime ? fit(String(d.startTime)) : '', d.victory ? '胜利' : '失败']
        .filter(Boolean)
        .join(' · '),
      accent: ACCENT.kog,
      theme: 'kog',
      icon: ICON.kog,
      stats: [
        { label: '结果', value: d.victory ? '胜利' : '失败', tone },
        { label: `${d.myCamp} KDA`, value: d.myKda || '—' },
        { label: `${d.enemyCamp} KDA`, value: d.enemyKda || '—' },
        { label: '经济', value: d.myMoney ? `${d.myMoney}` : '—', note: d.enemyMoney ? `对方 ${d.enemyMoney}` : '' },
        { label: '推塔', value: d.myTower !== '' ? `${d.myTower}` : '—', note: d.enemyTower !== '' ? `对方 ${d.enemyTower}` : '' }
      ].filter(item => item.value !== '—'),
      sections: [
        myRows.length && { title: `我方 · ${d.myCamp}`, hint: `${myRows.length} 人`, kind: 'rows', indexed: false, rows: myRows },
        enemyRows.length && { title: `敌方 · ${d.enemyCamp}`, hint: `${enemyRows.length} 人`, kind: 'rows', indexed: false, rows: enemyRows }
      ].filter(Boolean),
      note: d.tips || '',
      footer: `王者详细${d.index} · 共 ${d.total} 局`
    },
    text: `【对局详情·王者】第 ${d.index}/${d.total} 局 ${d.mapName} ${d.victory ? '胜利' : '失败'} ${d.myKda} / ${d.enemyKda}`
  }
}

/* ---------------- 和平精英 ---------------- */

export async function pubgProfileCard(userKey) {
  const pubg = await games.pubg()
  const data = await pubg.profile(userKey)

  const areaText = [data.area, data.server].filter(Boolean)
  const dedupArea = areaText.filter(
    (text, i) => !areaText.some((other, j) => i !== j && other !== text && other.includes(text))
  )

  const stats = [
    { label: '等级', value: data.level ? `${data.level} 级` : '—' },
    { label: '区服', value: dedupArea.join(' · ') || '—' },
    { label: '状态', value: data.online ? '游戏在线' : '离线' },
    { label: '段位', value: data.rank || '—' },
    { label: '赛季场次', value: data.matches ? `${data.matches} 场` : '—' },
    { label: '吃鸡', value: data.wins !== '' ? `${data.wins} 次` : '—' }
  ].filter(item => item.value !== '—' || item.label === '段位')

  const extra = [
    data.mode && { label: '模式', value: data.mode },
    data.score !== '' && { label: '积分', value: `${data.score}/${data.levelUpScore || '-'}` },
    data.season && { label: '赛季', value: data.season },
    data.lastBattleTime && { label: '最近一战', value: fmtTime(data.lastBattleTime) }
  ].filter(Boolean)

  return {
    model: {
      eyebrow: '和平精英 · 营地',
      title: data.nickname || '角色卡',
      subtitle: [dedupArea.join(' · '), data.online ? '游戏在线' : '游戏离线'].filter(Boolean).join(' · '),
      accent: ACCENT.pubg,
      theme: 'pubg',
      icon: ICON.pubg,
      stats,
      sections: extra.length ? [{ title: '赛季信息', kind: 'rows', rows: extra.map(item => ({ main: item.label, right: `<span class="k">${item.value}</span>` })) }] : [],
      footer: 'game-hub · 角色卡'
    },
    text: `【和平营地角色卡】${data.nickname || ''}`
  }
}

export async function pubgRecentCard(userKey) {
  const pubg = await games.pubg()
  const { count, items } = await pubg.recent(userKey)

  if (!count) {
    return {
      model: {
        eyebrow: '和平精英 · 战绩',
        title: '最近没有对局',
        accent: ACCENT.pubg,
      theme: 'pubg',
        icon: ICON.pubg,
        note: '接口正常，只是这个号近期没有可查的对局记录。',
        footer: 'game-hub · 和平战绩'
      },
      text: '【和平最近战绩】最近没有对局记录。'
    }
  }

  const source = items.slice(0, 12)
  const icons = await imgList(source.map(item => item.modeIcon || ''))
  const rows = source.map((item, index) => {
    // 原版规则：金 = 胜（吃鸡）/ MVP，红 = 负；这里 MVP 优先于吃鸡
    const tone = item.mvp ? 'gold' : Number(item.rank) === 1 ? 'win' : ''
    return {
      icon: icons[index],
      main: [fit(item.time), fit(item.mode), fit(item.map)].filter(Boolean).join(' · '),
      sub: [item.rank && `排名 ${item.rank}`, item.kills !== '' && `击杀 ${item.kills}`, item.damage !== '' && `伤害 ${item.damage}`]
        .filter(Boolean)
        .join(' · '),
      pill: tone === 'gold' ? 'MVP' : tone === 'win' ? '吃鸡' : '',
      tone,
      right: item.rating ? `评分 <span class="k">${item.rating}</span>` : ''
    }
  })

  return {
    model: {
      eyebrow: '和平精英 · 战绩',
      title: `最近 ${count} 局`,
      subtitle: '发「和平战绩详情 序号」看单局明细',
      accent: ACCENT.pubg,
      theme: 'pubg',
      icon: ICON.pubg,
      sections: [{ title: '对局', kind: 'rows', rows }],
      footer: 'game-hub · 和平战绩'
    },
    text: `【和平最近战绩】共 ${count} 局`
  }
}

/** 单局详情：地图背景大图 + 名次/击杀/伤害 + 队友列表 */
export async function pubgBattleDetailCard(userKey, index) {
  const pubg = await games.pubg()
  const d = await pubg.battleDetail(userKey, index)
  const bg = await imgData(d.bgImage)
  const icons = await imgList(d.members.map(m => m.avatar || ''))

  const rows = d.members.map((m, i) => ({
    icon: icons[i],
    main: m.name || '玩家',
    sub: [m.div, m.survival && `存活 ${m.survival}`, m.stats.map(s => `${s.label} ${s.value}`).join(' · ')]
      .filter(Boolean)
      .join(' · '),
    pill: m.mvp ? 'MVP' : '',
    tone: m.mvp ? 'gold' : '',
    me: m.me,
    right: m.eval ? `<span class="k">${esc(m.eval)}</span>` : ''
  }))

  return {
    model: {
      eyebrow: `对局详情 · 第 ${d.index}/${d.total} 局`,
      title: `和平精英 · ${d.mapMode || '对局'}`,
      subtitle: [d.playTime, d.hardType, d.resultDesc].filter(Boolean).join(' · '),
      accent: ACCENT.pubg,
      theme: 'pubg',
      icon: ICON.pubg,
      sections: [
        bg && {
          kind: 'banner',
          src: bg,
          height: 200,
          caption: { main: d.divName || d.result || '对局', sub: d.resultDesc || d.hardType || '' }
        },
        rows.length && { title: '队友', hint: `${rows.length} 人`, kind: 'rows', indexed: false, rows }
      ].filter(Boolean),
      stats: [
        { label: '名次', value: d.rank !== '' ? `#${d.rank}` : '—', tone: Number(d.rank) === 1 ? 'win' : '' },
        { label: '淘汰', value: d.kills !== '' ? `${d.kills}` : '—' },
        { label: '伤害', value: d.damage !== '' ? `${d.damage}` : '—' },
        d.assist !== '' && { label: '助攻', value: `${d.assist}` },
        d.survival && { label: '存活', value: d.survival },
        d.playerNum && { label: '参赛', value: `${d.playerNum} 队` }
      ].filter(item => item && item.value !== '—'),
      note: d.resultDesc || '',
      footer: `和平详细${d.index} · 共 ${d.total} 局`
    },
    text: `【对局详情·和平】第 ${d.index}/${d.total} 局 ${d.mapMode} 第${d.rank}名 淘汰${d.kills} 伤害${d.damage}`
  }
}

/** 枪械熟练度：每把枪的等级 / 击杀 / 爆头率 / 单局均伤 */
export async function pubgWeaponsCard(userKey) {
  const pubg = await games.pubg()
  const { count, items } = await pubg.weapons(userKey)

  if (!count) {
    return {
      model: {
        eyebrow: '和平精英 · 枪械',
        title: '还没有枪械熟练度数据',
        accent: ACCENT.pubg,
        theme: 'pubg',
        icon: ICON.pubg,
        note: '打出几局之后营地才会统计。',
        footer: 'game-hub · 枪械熟练度'
      },
      text: '【枪械熟练度】暂无数据'
    }
  }

  const icons = await imgList(items.map(item => item.icon))
  const totalKills = items.reduce((sum, item) => sum + item.kills, 0)
  const best = items[0]

  const rows = items.slice(0, 14).map((item, i) => ({
    icon: icons[i],
    iconFit: 'contain',
    iconPlate: 'light',
    main: [item.name, item.type].filter(Boolean).join(' · '),
    sub: [
      `命中 ${pct(item.hitRate)}`,
      `爆头 ${pct(item.headRate)}`,
      `单局伤害 ${dec(item.damagePerGame)}`,
      item.maxKill ? `最高单局 ${item.maxKill} 杀` : ''
    ]
      .filter(Boolean)
      .join(' · '),
    right: `Lv.<span class="k">${esc(item.level)}</span> · ${item.kills} 杀`
  }))

  return {
    model: {
      eyebrow: '和平精英 · 枪械熟练度',
      title: `共 ${count} 把 · ${totalKills} 击杀`,
      subtitle: `最常用：${best.name}（${best.kills} 杀 / Lv.${best.level}）`,
      accent: ACCENT.pubg,
      theme: 'pubg',
      icon: ICON.pubg,
      sections: [{ title: '按击杀排序', kind: 'rows', rows }],
      footer: 'game-hub · 枪械熟练度'
    },
    text: `【枪械熟练度】${count} 把，共 ${totalKills} 杀，最常用 ${best.name}`
  }
}

/** 王牌印记：印记墙 + 最高段位 + 收金纪录 */
export async function pubgHonorCard(userKey) {
  const pubg = await games.pubg()
  const d = await pubg.honor(userKey)
  const icons = await imgList(d.badges.map(item => item.icon))

  const rows = d.badges.map((item, i) => ({
    icon: icons[i],
    main: item.name,
    sub: `达成 ${item.times} 次`,
    right: '<span class="k">✓</span>'
  }))

  return {
    model: {
      eyebrow: '和平精英 · 印记',
      title: d.highestDivName ? `最高 ${d.highestDivName}` : '印记墙',
      subtitle: [
        d.bestIncomeName && `收金 ${d.bestIncomeName}`,
        d.huntedDiv && `地铁 ${d.huntedDiv}`,
        d.vsTeamDiv && `团竞 ${d.vsTeamDiv}`,
        d.likes && `获赞 ${d.likes}`
      ]
        .filter(Boolean)
        .join(' · '),
      accent: ACCENT.pubg,
      theme: 'pubg',
      icon: ICON.pubg,
      // 段位已经在标题上了，这里只放「另外三项纪录」，三格刚好填满一行
      stats: [
        d.highestDivTimes !== '' && { label: '段位到达次数', value: `${d.highestDivTimes} 次` },
        d.bestIncomeValue !== '' && {
          label: '单局最高收金',
          value: `${Number(d.bestIncomeValue).toLocaleString('en-US')}`,
          note: d.bestIncomeSeason || ''
        },
        d.huntedValue !== '' && { label: '狩猎积分', value: `${d.huntedValue}`, note: d.huntedDiv || '' }
      ].filter(Boolean),
      sections: rows.length
        ? [{ title: '已获得印记', hint: `${rows.length} 项`, kind: 'rows', rows }]
        : [],
      note: rows.length ? '' : '还没有拿到印记：经典模式打到王牌、地铁逃生撤离带出物资都会记一笔。',
      footer: 'game-hub · 王牌印记'
    },
    text: `【王牌印记】最高 ${d.highestDivName || '—'}，${d.badges.map(b => `${b.name}×${b.times}`).join(' ')}`
  }
}

/** 周报：本周场次 / 吃鸡 / 前十 / 击杀 / K/D / 积分变化 */
export async function pubgWeeklyCard(userKey) {
  const pubg = await games.pubg()
  const d = await pubg.weekly(userKey)
  const icon = await imgData(d.segmentIcon)
  const change = Number(d.ratingChange) || 0
  const winRate = d.battles ? pct(d.wins / d.battles) : '—'
  const top10Rate = d.battles ? pct(d.top10 / d.battles) : '—'

  return {
    model: {
      eyebrow: '和平精英 · 周报',
      title: d.segmentName || '本周战报',
      subtitle: [d.mode, `当前积分 ${d.currentRating}`, change ? `本周 ${change > 0 ? '+' : ''}${change} 分` : '']
        .filter(Boolean)
        .join(' · '),
      accent: ACCENT.pubg,
      theme: 'pubg',
      icon: ICON.pubg,
      // 场次放进大数字，下面六格只放比率与累计值，和 figure 不重复
      sections: [
        icon && {
          kind: 'figure',
          src: icon,
          size: 118,
          big: `${d.battles} 局`,
          lines: d.battles ? [`吃鸡率 <b>${winRate}</b>　前十率 <b>${top10Rate}</b>`] : [],
          tags: ['和平战绩', '枪械熟练度', '王牌印记']
        }
      ].filter(Boolean),
      stats: [
        { label: '吃鸡', value: `${d.wins}`, tone: d.wins > 0 ? 'win' : '' },
        { label: '前十', value: `${d.top10}` },
        { label: '击杀', value: `${d.kills}` },
        { label: '阵亡', value: `${d.deaths}` },
        { label: 'K/D', value: dec(d.kd, 2) },
        {
          label: '场均积分',
          value: change ? `${Number(d.ratingChangeAvg) > 0 ? '+' : ''}${dec(d.ratingChangeAvg, 1)}` : '—'
        }
      ],
      note: d.battles ? '' : '本周还没有对局记录。',
      footer: 'game-hub · 和平周报'
    },
    text: `【和平周报】${d.segmentName} ${d.battles} 局，吃鸡 ${d.wins} 次，K/D ${dec(d.kd, 2)}`
  }
}

/* ---------------- 无畏契约 ---------------- */

export async function valAgentsCard(keyword) {
  const val = await games.val()
  const { count, items } = await val.agents()
  const kw = String(keyword || '').trim()
  const hit = kw ? items.filter(item => item.name.includes(kw) || (item.role || '').includes(kw)) : items

  if (!hit.length) {
    return {
      model: {
        eyebrow: '无畏契约 · 特工',
        title: `没有匹配「${kw}」的特工`,
        accent: ACCENT.val,
      theme: 'val',
        icon: ICON.val,
        note: '发「瓦英雄」看全部特工。',
        footer: 'game-hub · 瓦英雄'
      },
      text: `没有匹配「${kw}」的特工。`
    }
  }

  // valorant-api 的图标国内基本连不上，所以头像用掌瓦 CDN 的 agent_id 大图（离线快照里没有就退化成文字瓷砖）
  const icons = await imgList(hit.map(item => item.icon || ''))

  return {
    model: {
      eyebrow: '无畏契约 · 特工',
      title: kw ? `匹配「${kw}」` : `全部 ${count} 位特工`,
      subtitle: kw ? `命中 ${hit.length} 位` : '发「瓦特工」看你的特工熟练度',
      accent: ACCENT.val,
      theme: 'val',
      icon: ICON.val,
      sections: [
        {
          title: '特工图鉴',
          kind: 'grid',
          columns: 5,
          aspect: 1,
          items: hit.map((item, i) => ({ src: icons[i], label: item.name, sub: item.role || '' }))
        }
      ],
      footer: 'game-hub · 瓦英雄'
    },
    text: `【无畏特工】共 ${hit.length} 位：${hit.map(item => item.name).join('、')}`
  }
}

/**
 * 瓦地图：登录了就用「我的地图数据」（带 minimap 图 + 胜率 / K/D），
 * 没登录就退回公开名单 —— 公开源在国内拿不到地图图，别硬凑一堆空瓷砖。
 */
export async function valMapsCard(userKey) {
  const val = await games.val()

  try {
    const data = await val.mapsPerf(userKey)
    if (data.count) {
      const icons = await imgList(data.items.map(item => item.icon))
      return {
        model: {
          eyebrow: '无畏契约 · 地图数据',
          title: `本赛季打过 ${data.count} 张图`,
          subtitle: [data.nickname, data.seasonName].filter(Boolean).join(' · '),
          accent: ACCENT.val,
          theme: 'val',
          icon: ICON.val,
          sections: [
            {
              title: '地图熟练度',
              hint: '按场次排序',
              kind: 'grid',
              columns: 4,
              aspect: 1,
              items: data.items.map((item, i) => ({
                src: icons[i],
                label: item.name,
                sub: `胜率 ${pct(item.winRate, 1)} · KD ${dec(item.kd, 2)}`
              }))
            }
          ],
          footer: 'game-hub · 瓦地图'
        },
        text: `【无畏地图数据】${data.items.map(item => `${item.name} ${item.winRate}%`).join('、')}`
      }
    }
  } catch {
    // 没登录 / 接口异常都走下面的公开名单
  }

  const { count, items } = await val.maps()
  const names = items.map(item => item.name).filter(Boolean)
  const distinct = names.filter((name, i) => names.indexOf(name) === i)
  // 地图原画是随插件烘好的本地图，可以放心做成网格
  // 「斗牛 / 靶场 / 基础训练」是靶场类地图，不算正式地图，公开名单里剔掉
  const JUNK_MAP = /斗牛|靶场|基础训练|训练场/
  const seen = new Set()
  const picked = []
  for (const item of items) {
    if (!item.name || seen.has(item.name) || JUNK_MAP.test(item.name)) continue
    seen.add(item.name)
    picked.push(item)
  }
  // 并发出图；没烘到本地的那几张会拿远程 splash，超时就当没图，不拖累整张卡
  const icons = await imgList(picked.map(item => item.icon))
  const tiles = picked.map((item, i) => ({ src: icons[i], label: item.name }))

  if (tiles.length) {
    return {
      model: {
        eyebrow: '无畏契约 · 地图',
        title: `全部 ${tiles.length} 张地图`,
        subtitle: '登录后发「瓦地图」看每张图的胜率与 KD',
        accent: ACCENT.val,
        theme: 'val',
        icon: ICON.val,
        sections: [{ title: '地图一览', kind: 'grid', columns: 4, aspect: 0.5625, items: tiles }],
        footer: 'game-hub · 瓦地图'
      },
      text: `【无畏地图】共 ${count} 张：${distinct.join('、')}`
    }
  }

  return {
    model: {
      eyebrow: '无畏契约 · 地图',
      title: `全部 ${distinct.length} 张地图`,
      subtitle: '登录后发「瓦地图」看每张图的胜率与 KD',
      accent: ACCENT.val,
      theme: 'val',
      icon: ICON.val,
      sections: [{ kind: 'chips', chips: distinct }],
      footer: 'game-hub · 瓦地图'
    },
    text: `【无畏地图】共 ${count} 张：${distinct.join('、')}`
  }
}

/* ---------------- 瓦：对局详情 / 同场 / 枪械 / 特工 ---------------- */

/** 记分板 → 队伍分组行；icon 用特工头像，right 放 ACS */
function teamRows(players, team) {
  return players
    .filter(player => player.team === team)
    .sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
}

async function playerRows(players, { detail = false } = {}) {
  const icons = await imgList(players.map(player => player.agentIcon))
  return players.map((player, i) => ({
    icon: icons[i],
    main: [player.agent || '未知特工', player.name].filter(Boolean).join(' · '),
    sub: [
      player.kda && `KDA ${player.kda}`,
      player.tier,
      detail && player.damage !== '' && `伤害 ${player.damage}`,
      detail && player.headshotRate && `爆头 ${player.headshotRate}`
    ]
      .filter(Boolean)
      .join(' · '),
    me: player.isMe,
    right: player.score ? `ACS <span class="k">${esc(player.score)}</span>` : ''
  }))
}

/** 瓦对局详情：地图图 + 比分 + 双方十人 */
export async function valMatchDetailCard(userKey, index) {
  const val = await games.val()
  const d = await val.matchDetail(userKey, index)
  const mapImage = await imgData(d.mapImage)
  const tone = d.victory ? 'win' : 'lose'

  const [myRows, enemyRows] = await Promise.all([
    playerRows(teamRows(d.players, d.myTeam)),
    playerRows(d.players.filter(player => player.team !== d.myTeam))
  ])

  return {
    model: {
      eyebrow: `对局详情 · 第 ${d.index}/${d.total} 局`,
      title: `无畏契约 · ${d.mapName || '对局'}`,
      subtitle: [d.mode, d.duration, d.endTime].filter(Boolean).join(' · '),
      accent: ACCENT.val,
      theme: 'val',
      icon: ICON.val,
      sections: [
        {
          kind: 'figure',
          src: mapImage,
          size: 180,
          tone,
          big: `${d.winScore} : ${d.loseScore}`,
          lines: [
            `结果：<b>${esc(d.resultTitle || (d.victory ? '胜利' : '失败'))}</b>　我方 <b>${esc(d.myTeamText || '—')}</b>`,
            d.level ? `我的评价：<b>${esc(d.level)}</b> ${esc(d.levelTitle)}` : '',
            `我的 KDA <b>${esc(d.myKda || '—')}</b>　ACS <b>${esc(d.myScore || '—')}</b>`
          ].filter(Boolean),
          tags: d.myRank ? [`全场第 ${d.myRank} 名`] : []
        },
        {
          title: `我方 · ${d.myTeamText || ''}`,
          hint: `${d.totals.ourKills} 杀 / ${Math.round(Number(d.totals.ourDamage) || 0)} 伤害`,
          kind: 'rows',
          indexed: false,
          rows: myRows
        },
        {
          title: `敌方 · ${d.enemyTeamText || ''}`,
          hint: `${d.totals.theirKills} 杀 / ${Math.round(Number(d.totals.theirDamage) || 0)} 伤害`,
          kind: 'rows',
          indexed: false,
          rows: enemyRows
        }
      ],
      note: '掌瓦数据有 1~2 小时延迟；发「瓦详细2」换一局看。',
      footer: `瓦详细${d.index} · 共 ${d.total} 局`
    },
    text: `【对局详情·瓦】第 ${d.index}/${d.total} 局 ${d.mapName} ${d.winScore}:${d.loseScore} ${d.resultTitle}，我的KDA ${d.myKda}`
  }
}

/** 瓦同场：这一局十个人的段位 / 伤害 / 爆头率 */
export async function valPeersCard(userKey, index) {
  const val = await games.val()
  const d = await val.matchDetail(userKey, index)
  const players = [...d.players].sort((a, b) => (Number(b.score) || 0) - (Number(a.score) || 0))
  const icons = await imgList(players.map(player => player.agentIcon))

  const rows = players.map((player, i) => ({
    icon: icons[i],
    main: [player.agent, player.name].filter(Boolean).join(' · '),
    sub: [player.tier, player.damage !== '' && `伤害 ${player.damage}`, player.headshotRate && `爆头 ${player.headshotRate}`, player.achievements?.[0]]
      .filter(Boolean)
      .join(' · '),
    me: player.isMe,
    pill: player.team === d.myTeam ? '我方' : '敌方',
    tone: player.team === d.myTeam ? 'win' : 'lose',
    right: `ACS <span class="k">${esc(player.score || '—')}</span>`
  }))

  return {
    model: {
      eyebrow: '无畏契约 · 同场玩家',
      title: `${d.mapName} · 10 人`,
      subtitle: [d.mode, d.endTime, `第 ${d.index}/${d.total} 局`].filter(Boolean).join(' · '),
      accent: ACCENT.val,
      theme: 'val',
      icon: ICON.val,
      sections: [{ title: '按 ACS 排序', kind: 'rows', indexed: false, rows }],
      footer: 'game-hub · 瓦同场'
    },
    text: `【瓦同场】${d.mapName}：${players.map(p => `${p.name}(${p.score})`).join('、')}`
  }
}

/** 瓦枪械熟练度：排序口径可换（击杀 / 爆头 / 回合） */
const VAL_WEAPON_SORT = {
  击杀: item => item.kills,
  爆头: item => item.headRate,
  回合: item => item.killsPerRound,
  最远: item => item.farthest
}

export async function valWeaponsCard(userKey, sortKey) {
  const val = await games.val()
  const data = await val.weapons(userKey)
  const key = Object.keys(VAL_WEAPON_SORT).find(name => String(sortKey || '').includes(name)) || '击杀'
  const items = [...data.items].sort((a, b) => VAL_WEAPON_SORT[key](b) - VAL_WEAPON_SORT[key](a))
  const icons = await imgList(items.map(item => item.icon))
  const totalKills = data.items.reduce((sum, item) => sum + item.kills, 0)

  const rows = items.slice(0, 14).map((item, i) => ({
    icon: icons[i],
    iconFit: 'contain',
    // 掌瓦的枪械图是白色剪影，浅色托板上会看不见 → 固定深色托板
    iconPlate: 'dark',
    main: [item.name, item.category].filter(Boolean).join(' · '),
    sub: [
      `击杀 ${item.kills}`,
      `爆头 ${dec(item.headRate, 1)}%`,
      `每回合 ${dec(item.killsPerRound, 2)} 杀`,
      item.farthest ? `最远 ${dec(item.farthest, 1)}m` : ''
    ]
      .filter(Boolean)
      .join(' · '),
    right: `<span class="k">${item.kills}</span> 杀`
  }))

  return {
    model: {
      eyebrow: '无畏契约 · 枪械熟练度',
      title: `${data.count} 把枪 · ${totalKills} 击杀`,
      subtitle: [data.nickname, data.seasonName, `按${key}排序`].filter(Boolean).join(' · '),
      accent: ACCENT.val,
      theme: 'val',
      icon: ICON.val,
      sections: [{ title: '枪械', hint: '发「瓦枪械 爆头」换排序', kind: 'rows', rows }],
      note: data.count ? '' : '本赛季还没有枪械数据，打几局再看。',
      footer: 'game-hub · 瓦枪械'
    },
    text: `【瓦枪械】${data.count} 把，共 ${totalKills} 杀`
  }
}

/** 瓦特工熟练度：场次 / 胜率 / K/D / 使用时长 */
export async function valAgentsPerfCard(userKey) {
  const val = await games.val()
  const data = await val.agentsPerf(userKey)
  const icons = await imgList(data.items.map(item => item.avatar))

  return {
    model: {
      eyebrow: '无畏契约 · 特工熟练度',
      title: `本赛季用过的 ${data.count} 位特工`,
      subtitle: [data.nickname, data.seasonName].filter(Boolean).join(' · '),
      accent: ACCENT.val,
      theme: 'val',
      icon: ICON.val,
      sections: [
        {
          title: '按场次排序',
          kind: 'grid',
          columns: 5,
          aspect: 1,
          items: data.items.map((item, i) => ({
            src: icons[i],
            label: item.name,
            sub: `${item.matches} 场 · ${item.winRate}%`
          }))
        }
      ],
      note: data.count ? '' : '本赛季还没有特工数据。',
      footer: 'game-hub · 瓦特工'
    },
    text: `【瓦特工熟练度】${data.items.map(item => `${item.name} ${item.matches}场`).join('、')}`
  }
}

function valStats(panel) {
  return [
    { label: '当前段位', value: panel.tier || '—' },
    { label: '赛季最高', value: panel.peak || '—' },
    { label: '场次', value: panel.total || '—' },
    { label: '胜率', value: fmtPercent(panel.winRate) || '—' },
    { label: 'ACS', value: panel.acs || '—' },
    { label: 'K/D', value: panel.kd || '—' }
  ]
}

async function battleRows(panel) {
  const icons = await imgList(panel.items.map(item => item.头像))
  return panel.items.map((item, index) => {
    const tone = toneOf(item.结果)
    return {
      icon: icons[index],
      main: fit(item.对局) || '对局',
      sub: [fit(item.特工), fit(item.时间), item.KDA && `KDA ${item.KDA}`].filter(Boolean).join(' · '),
      pill: tone ? PILL_TEXT[tone] : '',
      tone,
      right: item.ACS ? `ACS <span class="k">${item.ACS}</span>` : ''
    }
  })
}

export async function valPanelCard(userKey, mode = 'panel') {
  const val = await games.val()
  const panel = await val.panel(userKey)

  if (mode === 'battles') {
    if (!panel.count) {
      return {
        model: {
          eyebrow: '无畏契约 · 战绩',
          title: '最近没有对局',
          accent: ACCENT.val,
      theme: 'val',
          icon: ICON.val,
          note: '掌瓦接口正常，只是这个号近期没有战绩。',
          footer: 'game-hub · 瓦战绩'
        },
        text: '【无畏最近战绩】最近没有对局记录。'
      }
    }
    return {
      model: {
        eyebrow: '无畏契约 · 战绩',
        title: `最近 ${panel.count} 局`,
        subtitle: [panel.nickname, panel.tier].filter(Boolean).join(' · '),
        accent: ACCENT.val,
      theme: 'val',
        icon: ICON.val,
        sections: [{ title: '对局', kind: 'rows', rows: await battleRows(panel) }],
        footer: 'game-hub · 瓦战绩'
      },
      text: `【无畏最近战绩】共 ${panel.count} 局`
    }
  }

  return {
    model: {
      eyebrow: '无畏契约 · 掌瓦',
      title: panel.nickname || '个人面板',
      subtitle: [panel.tier, panel.peak && `赛季最高 ${panel.peak}`].filter(Boolean).join(' · '),
      accent: ACCENT.val,
      theme: 'val',
      icon: ICON.val,
      stats: valStats(panel),
      sections: panel.count ? [{ title: `最近 ${panel.count} 局`, kind: 'rows', rows: await battleRows(panel) }] : [],
      note: panel.count ? '' : '最近没有对局记录。',
      footer: 'game-hub · 瓦面板'
    },
    text: `【无畏掌瓦面板】${panel.nickname || ''}`
  }
}

/* ---------------- 账号 ---------------- */

export async function statusCard(userKey) {
  const storeModule = await store()
  const accounts = storeModule.listAccounts(userKey)
  const channelOf = account => {
    const raw = String(account?.channel || account?.loginPlatform || '').toLowerCase()
    // 老凭证（这次双通道之前登录的）没有渠道字段，那时只有微信一条路
    if (raw === 'qq' || raw === 'qqconnect') return 'QQ'
    return '微信'
  }
  const rows = ['kog', 'pubg', 'val'].map(game => {
    const account = accounts[game]
    if (!account) {
      return { main: GAME_NAMES[game], sub: '未登录', right: '<span class="ico lose">' + iconSvg('prohibit') + '</span>' }
    }
    const who = account.nickname || account.userName || account.roleName || account.userId || '已登录'
    const at = account.savedAt ? String(account.savedAt).slice(0, 10) : ''
    const chan = channelOf(account)
    const sub = [who, chan && `${chan}通道`, at && `${at} 登录`].filter(Boolean).join(' · ')
    return { main: GAME_NAMES[game], sub, right: '<span class="ico win">' + iconSvg('check') + '</span>' }
  })

  const logged = rows.filter(row => row.right.includes('ico win')).length

  return {
    model: {
      eyebrow: '账号 · 登录状态',
      title: `${logged} / 3 已登录`,
      subtitle: '凭证按你的 QQ 单独保存，群里其他人看不到',
      accent: ACCENT.common,
      theme: 'common',
      icon: ICON.common,
      sections: [{ kind: 'rows', indexed: false, rows }],
      footer: '营地登录 · 和平登录 · 瓦登录'
    },
    text: `【登录状态】${logged} / 3 已登录`
  }
}

export async function unbindCard(userKey, keyword) {
  const storeModule = await store()
  const game = gameIdOf(keyword)

  if (!game) {
    const accounts = storeModule.listAccounts(userKey)
    const mine = ['kog', 'pubg', 'val'].filter(g => accounts[g]).map(g => GAME_NAMES[g])
    return {
      model: {
        eyebrow: '账号 · 解绑',
        title: '用法：解绑 王者',
        subtitle: mine.length ? `你当前已登录：${mine.join('、')}` : '你还没有登录任何游戏',
        accent: ACCENT.common,
      theme: 'common',
        icon: ICON.common,
        sections: [
          {
            kind: 'chips',
            chips: ['解绑 王者', '解绑 和平', '解绑 无畏']
          }
        ],
        footer: '只删自己名下的凭证'
      },
      text: `用法：解绑 <王者|和平|无畏>`
    }
  }

  storeModule.dropAccount(game, userKey)
  return {
    model: {
      eyebrow: '账号 · 解绑',
      title: `已解绑${GAME_NAMES[game]}`,
      subtitle: '你名下的凭证已删除，需要重新扫码才能再查',
      accent: ACCENT.common,
      theme: 'common',
      icon: ICON.common,
      sections: [{ kind: 'chips', chips: [`${game === 'kog' ? '营地' : game === 'pubg' ? '和平' : '瓦'}登录`], hot: true }],
      footer: 'game-hub · 解绑'
    },
    text: `✓ 已删除你名下的${GAME_NAMES[game]}凭证。`
  }
}

/* ---------------- 登录 ---------------- */

/** 二维码卡片：把二维码直接画进图里，避免「一张图 + 一段文字」两条消息 */
export async function loginQrCard(game, qrDataUrl, appName, options = {}) {
  const gameMeta = gameById(game) || GAMES[0]
  const channel = options.channel === 'qq' ? 'qq' : 'wx'
  const channelName = channel === 'qq' ? '手机 QQ' : '微信'
  const appLabel = channel === 'qq' ? 'QQ' : '微信'

  return {
    model: {
      eyebrow: `${gameMeta.name} · ${appLabel} 扫码登录`,
      title: appName || gameMeta.login[0],
      subtitle: `用${channelName}扫码，并在手机上确认`,
      accent: channel === 'qq' ? '#12b7f5' : '#07c160',
      theme: game,
      icon: gameMeta.icon || 'gear',
      /** 二维码必须无损 PNG，缩放扫不出来就完了 */
      png: true,
      sections: [
        {
          kind: 'image',
          image: { src: qrDataUrl, width: 320, height: 320 }
        },
        {
          kind: 'rows',
          indexed: false,
          rows: [
            { main: `1. ${channelName}「扫一扫」上面的二维码`, right: '' },
            { main: '2. 手机上点击确认登录', right: '' },
            { main: '3. 结果会自动发回这里', right: '' }
          ]
        }
      ],
      note:
        channel === 'qq'
          ? 'QQ 通道：扫码用的是手机 QQ，不是微信。二维码 2 分钟内有效。'
          : '微信通道：扫码用的是微信。二维码 2 分钟内有效。',
      footer: `${gameMeta.login[0]} ${appLabel}`
    },
    text: `【${appName}】请用${channelName}扫码登录，2 分钟内有效。`
  }
}

export function loginResultCard(game, state, detail, options = {}) {
  const gameMeta = gameById(game) || GAMES[0]
  const channel = options.channel === 'qq' ? 'qq' : 'wx'
  const channelName = channel === 'qq' ? 'QQ' : '微信'
  const map = {
    success: { title: '登录成功', sub: `凭证已记到你的 QQ 名下（${channelName}通道）`, icon: 'check' },
    expired: { title: '二维码已过期', sub: '重新发一次登录指令即可', icon: 'hourglass' },
    canceled: { title: '已取消登录', sub: '需要时再发一次登录指令', icon: 'prohibit' },
    error: { title: '登录失败', sub: detail || '未知错误', icon: 'warn' },
    scanned: { title: '已扫码', sub: '请在手机上点击「确认登录」', icon: 'eye' },
    timeout: { title: '等待超时', sub: '100 秒内没有完成扫码，请重新发起', icon: 'hourglass' }
  }
  const meta = map[state] || map.error
  const note =
    state === 'success'
      ? [detail ? `账号：${detail}` : '', options.warning || ''].filter(Boolean).join(' · ')
      : ''

  return {
    model: {
      eyebrow: `${gameMeta.name} · ${channelName} 扫码登录`,
      title: meta.title,
      subtitle: meta.sub,
      accent: gameMeta.accent,
      theme: game,
      icon: meta.icon,
      sections:
        state === 'success'
          ? [{ kind: 'chips', chips: gameMeta.privateQueries.map(q => q.cmd), hot: true }]
          : [{ kind: 'chips', chips: [`${gameMeta.login[0]} ${channelName}`], hot: true }],
      note,
      footer: state === 'success' ? 'game-hub · 已就绪' : 'game-hub · 登录'
    },
    text: `${meta.title}${detail ? `：${detail}` : ''}`
  }
}

/* ---------------- 错误 ---------------- */

export function errorCard(title, message, hint) {
  return {
    model: {
      eyebrow: '出错了',
      title,
      subtitle: message,
      accent: '#ff5468',
      theme: 'common',
      icon: 'warn',
      sections: hint?.length ? [{ kind: 'chips', chips: hint, hot: true }] : [],
      footer: 'game-hub'
    },
    text: `✗ ${title}：${message}`
  }
}
