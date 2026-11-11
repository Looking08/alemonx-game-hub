/**
 * 指令数据模型：图片菜单、文字帮助、指令注册都从这里取，
 * 改一处三处同步，不会出现「图上写了、机器人不认」的情况。
 *
 * 每条 privateQuery 里：
 *   cmd     —— 卡片/菜单上展示的写法
 *   desc    —— 一句话说明
 *   sample  —— 带参数的示例（有就展示示例，没有就展示 cmd）
 *   hero    —— 这一条就是「对局详情」，菜单里单独高亮
 */

export const GAMES = [
  {
    id: 'kog',
    name: '王者荣耀',
    icon: 'crown',
    accent: '#b07d1a',
    source: '王者营地',
    login: ['营地登录'],
    /** 两个扫码渠道，菜单上并排画出来，用户不用猜「扫哪个码」 */
    channels: [
      { key: 'wx', label: '微信', cmd: '营地登录 微信' },
      { key: 'qq', label: 'QQ', cmd: '营地登录 QQ' }
    ],
    help: '王者帮助',
    /** 单局详情的主写法：游戏名 + 详细 + 局号 */
    detailWord: '王者详细',
    detailCmd: '王者详细1',
    publicQueries: [
      { cmd: '英雄列表', desc: '133 位英雄头像图鉴，可加关键词筛选', sample: '英雄列表 猴' },
      { cmd: '英雄皮肤', desc: '该英雄全部皮肤大图', sample: '英雄皮肤 小乔' },
      { cmd: '英雄战力', desc: '四平台省 / 市 / 区县 + 国标战力', sample: '英雄战力 李白' }
    ],
    privateQueries: [
      { cmd: '王者主页', desc: '角色、段位、战斗力、胜率' },
      { cmd: '王者战绩', desc: '最近 12 局：英雄头像 / KDA / 评分' },
      { cmd: '王者详细1', desc: '单局双方十人：出装、评分、经济、推塔', hero: true }
    ]
  },
  {
    id: 'pubg',
    name: '和平精英',
    icon: 'parachute',
    accent: '#b45f1d',
    source: '和平营地',
    login: ['和平登录'],
    channels: [
      { key: 'wx', label: '微信', cmd: '和平登录 微信' },
      { key: 'qq', label: 'QQ', cmd: '和平登录 QQ' }
    ],
    help: '和平帮助',
    detailWord: '和平详细',
    detailCmd: '和平详细1',
    publicQueries: [],
    privateQueries: [
      { cmd: '角色卡', desc: '等级、区服、段位、赛季场次' },
      { cmd: '和平战绩', desc: '最近 10 局：排名 / 击杀 / 伤害' },
      { cmd: '和平详细1', desc: '单局地图背景、名次、队友与个人数据', hero: true },
      { cmd: '枪械熟练度', desc: '每把枪的等级 / 命中 / 爆头率' },
      { cmd: '王牌印记', desc: '印记墙、最高段位、收金纪录' },
      { cmd: '和平周报', desc: '本周场次 / 吃鸡 / 前十 / K/D' }
    ]
  },
  {
    id: 'val',
    name: '无畏契约',
    icon: 'crosshair',
    accent: '#d8354a',
    source: '掌上无畏契约',
    login: ['瓦登录'],
    channels: [
      { key: 'wx', label: '微信', cmd: '瓦登录 微信' },
      { key: 'qq', label: 'QQ', cmd: '瓦登录 QQ' }
    ],
    help: '瓦帮助',
    detailWord: '瓦详细',
    detailCmd: '瓦详细1',
    publicQueries: [
      { cmd: '瓦英雄', desc: '30 位特工头像与定位，可加关键词', sample: '瓦英雄 捷风' },
      { cmd: '瓦地图', desc: '地图原画一览；登录后看自己的胜率' }
    ],
    privateQueries: [
      { cmd: '瓦面板', desc: '段位、胜率、ACS、K/D、爆头率' },
      { cmd: '瓦战绩', desc: '最近 10 局：特工头像 / 结果 / ACS' },
      { cmd: '瓦详细1', desc: '地图、比分、双方十人明细与成就', hero: true },
      { cmd: '瓦同场', desc: '同场玩家的段位 / 伤害 / 爆头率', sample: '瓦同场 1' },
      { cmd: '瓦枪械', desc: '枪械熟练度，可换排序', sample: '瓦枪械 爆头' },
      { cmd: '瓦特工', desc: '本赛季各特工场次 / 胜率 / K/D' }
    ]
  }
]

export const COMMON = {
  title: '账号与通用',
  items: [
    { cmd: '游戏帮助', desc: '这张菜单' },
    { cmd: '登录状态', desc: '看自己三个游戏登了哪些、走的哪个渠道' },
    { cmd: '解绑 王者', desc: '删掉自己名下的凭证' }
  ]
}

export const TIPS = [
  '指令前缀 / # ! 都可以，也可以直接发指令名',
  '登录分微信和 QQ 两条通道，扫哪个码就发哪个',
  '看单局：瓦详细2 就是倒数第二局，尾数换 3 就是倒数第三局'
]

export const gameById = id => GAMES.find(g => g.id === id) || null

/** 一级菜单里每个游戏卡片要展示的「看某一局」命令 */
export const DETAIL_OF = {
  kog: '王者详细1',
  pubg: '和平详细1',
  val: '瓦详细1'
}
