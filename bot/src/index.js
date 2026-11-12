import { Router, defineChildren } from 'alemonjs'
import { gameHubExpose } from './expose/index.mjs'

// 只监听这两类事件，群聊 / 私聊
const router = Router.create({
  events: ['message.create', 'private.message.create']
})

// 指令分组：允许 / # ! 等前缀，也允许直接裸指令
const appGroup = router.group({
  routeText: {
    prefixes: ['/', '#', '＃', '!', '！'],
    stripPrefix: true,
    allowBare: true
  }
})

appGroup.use('help', () => import('./response/help.js'))
appGroup.use('ping', () => import('./response/ping.js'))
appGroup.use('hello', () => import('./response/hello.js'))
appGroup.use('状态', () => import('./response/status.js'))

/* ---- 游戏指令：登录（渠道既可用参数也可用别名；别名一并注册） ---- */
appGroup.use('营地登录', () => import('./game/login.mjs'))
appGroup.use('王者登录', () => import('./game/login.mjs'))
appGroup.use('王者营地登录', () => import('./game/login.mjs'))
appGroup.use('王者微信登录', () => import('./game/login.mjs'))
appGroup.use('王者QQ登录', () => import('./game/login.mjs'))
appGroup.use('营地QQ登录', () => import('./game/login.mjs'))
appGroup.use('营地微信登录', () => import('./game/login.mjs'))

appGroup.use('和平登录', () => import('./game/login.mjs'))
appGroup.use('和平精英登录', () => import('./game/login.mjs'))
appGroup.use('和平营地登录', () => import('./game/login.mjs'))
appGroup.use('和平微信登录', () => import('./game/login.mjs'))
appGroup.use('和平QQ登录', () => import('./game/login.mjs'))

appGroup.use('瓦登录', () => import('./game/login.mjs'))
appGroup.use('无畏登录', () => import('./game/login.mjs'))
appGroup.use('无畏契约登录', () => import('./game/login.mjs'))
appGroup.use('掌瓦登录', () => import('./game/login.mjs'))
appGroup.use('瓦微信登录', () => import('./game/login.mjs'))
appGroup.use('瓦QQ登录', () => import('./game/login.mjs'))
appGroup.use('掌瓦QQ登录', () => import('./game/login.mjs'))
appGroup.use('无畏QQ登录', () => import('./game/login.mjs'))

/* ---- 游戏指令：查询 ---- */
appGroup.use('游戏帮助', () => import('./game/query.mjs'))
appGroup.use('王者帮助', () => import('./game/query.mjs'))
appGroup.use('和平帮助', () => import('./game/query.mjs'))
appGroup.use('瓦帮助', () => import('./game/query.mjs'))

/* ---- 对局详情：瓦详细1 / 王者详细1 / 和平详细1 ----
   路由是按第一个空格切词、拿 tokens[0] 整词比对的，没有前缀匹配，
   所以「游戏名 + 详细 + 局号」的每一种组合都得单独注册。
   局号 1~12 够用（一天打不满 12 局），不写数字就是第 1 局。 */
const DETAIL_PREFIXES = ['瓦', '无畏', '掌瓦', '王者', '王者荣耀', '和平', '和平精英']
const DETAIL_WORDS = ['详细', '详情']
const DETAIL_INDEXES = ['', ...Array.from({ length: 12 }, (_, i) => String(i + 1))]

for (const prefix of DETAIL_PREFIXES) {
  for (const word of DETAIL_WORDS) {
    for (const index of DETAIL_INDEXES) {
      appGroup.use(`${prefix}${word}${index}`, () => import('./game/query.mjs'))
    }
  }
}

/* 老写法保留：对局详情 瓦 1 —— 已经记住老指令的人不能突然就用不了 */
appGroup.use('对局详情', () => import('./game/query.mjs'))
appGroup.use('对局详细', () => import('./game/query.mjs'))
appGroup.use('对局', () => import('./game/query.mjs'))

appGroup.use('英雄列表', () => import('./game/query.mjs'))
appGroup.use('英雄皮肤', () => import('./game/query.mjs'))
appGroup.use('查皮肤', () => import('./game/query.mjs'))
appGroup.use('英雄战力', () => import('./game/query.mjs'))
appGroup.use('王者主页', () => import('./game/query.mjs'))
appGroup.use('王者战绩', () => import('./game/query.mjs'))
appGroup.use('王者对局详情', () => import('./game/query.mjs'))

appGroup.use('角色卡', () => import('./game/query.mjs'))
appGroup.use('和平战绩', () => import('./game/query.mjs'))
appGroup.use('和平战绩详情', () => import('./game/query.mjs'))
appGroup.use('枪械熟练度', () => import('./game/query.mjs'))
appGroup.use('王牌印记', () => import('./game/query.mjs'))
appGroup.use('和平周报', () => import('./game/query.mjs'))

appGroup.use('瓦英雄', () => import('./game/query.mjs'))
appGroup.use('瓦地图', () => import('./game/query.mjs'))
appGroup.use('瓦面板', () => import('./game/query.mjs'))
appGroup.use('瓦战绩', () => import('./game/query.mjs'))
appGroup.use('瓦对局详情', () => import('./game/query.mjs'))
appGroup.use('瓦同场', () => import('./game/query.mjs'))
appGroup.use('瓦枪械', () => import('./game/query.mjs'))
appGroup.use('瓦特工', () => import('./game/query.mjs'))

/* ---- 账号 ---- */
appGroup.use('登录状态', () => import('./game/query.mjs'))
appGroup.use('解绑', () => import('./game/query.mjs'))

/* 启动后把渲染用的浏览器先拉起来，用户第一条指令就不必等 Chrome 冷启动（约 8~19 秒） */
setTimeout(() => {
  import('./game/render/shot.mjs')
    .then(mod => mod.warmRenderer?.())
    .catch(() => {})
}, 2000)

export default defineChildren({
  register() {
    return {
      responseRouter: router.define,
      // Expose：把三款游戏的查询能力注册成结构化动作，
      // 同一运行实例里的其他插件 / AI 可像调 MCP 工具一样调用（协议名 game-hub）。
      expose: gameHubExpose
    }
  }
})
