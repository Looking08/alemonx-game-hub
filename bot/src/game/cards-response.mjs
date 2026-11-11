/**
 * 四个通用指令的卡片模型。
 *
 * 单独抽出来是为了「预热脚本」和「运行时」用同一份 model —— 缓存的 key 是渲染后的
 * HTML 哈希，两边只要有一处措辞不一样就命中不了。
 */

export function helpModel() {
  return {
    eyebrow: 'MYBOT · 指令',
    title: '指令总览',
    subtitle: '前缀 / # ! 可有可无，直接发指令名也行',
    accent: '#5b7cfa',
    icon: 'gamepad',
    sections: [
      {
        title: '游戏',
        kind: 'rows',
        indexed: false,
        rows: [
          { main: '游戏帮助', sub: '支持的三个游戏（图片菜单）', right: '' },
          { main: '王者帮助 / 和平帮助 / 瓦帮助', sub: '单个游戏的完整指令', right: '' },
          { main: '营地登录 / 和平登录 / 瓦登录', sub: '微信扫码，结果自动回群', right: '' }
        ]
      },
      {
        title: '机器人',
        kind: 'rows',
        indexed: false,
        rows: [
          { main: 'ping', sub: '测试是否在线', right: '' },
          { main: 'hello', sub: '打个招呼', right: '' },
          { main: '状态', sub: '进程与内存', right: '' }
        ]
      },
      {
        title: '账号',
        kind: 'rows',
        indexed: false,
        rows: [
          { main: '登录状态', sub: '三个游戏登了哪些', right: '' },
          { main: '解绑 王者', sub: '删掉自己名下的凭证', right: '' }
        ]
      }
    ],
    footer: 'mybot · help'
  }
}

export function helpText() {
  return '发「游戏帮助」看游戏指令，发「状态」看运行情况。'
}

function uptimeText() {
  return `已稳定运行 ${Math.floor(process.uptime())} 秒`
}

export function pingModel() {
  return {
    eyebrow: 'MYBOT · PING',
    title: 'pong',
    subtitle: uptimeText(),
    accent: '#5b7cfa',
    icon: 'pulse',
    stats: [
      { label: '进程', value: `node ${process.version.replace(/^v/, '')}` },
      { label: 'PID', value: String(process.pid) },
      { label: '平台', value: 'onebot' }
    ],
    footer: 'mybot · 在线'
  }
}

export function pingText() {
  return `pong，已运行 ${Math.floor(process.uptime())} 秒`
}

export function helloModel(name) {
  return {
    eyebrow: 'MYBOT',
    title: `hello, ${name}`,
    subtitle: '发「游戏帮助」看看能查什么',
    accent: '#5b7cfa',
    icon: 'chat',
    footer: 'mybot'
  }
}

export function helloText(name) {
  return `hello, ${name}`
}

const mb = n => `${(n / 1024 / 1024).toFixed(1)} MB`

export function statusModel() {
  const mem = process.memoryUsage()
  return {
    eyebrow: 'MYBOT · 运行状态',
    title: '运行正常',
    subtitle: uptimeText(),
    accent: '#5b7cfa',
    icon: 'chart',
    stats: [
      { label: 'Node', value: process.version.replace(/^v/, '') },
      { label: '内存 RSS', value: mb(mem.rss) },
      { label: '堆内存', value: mb(mem.heapUsed) },
      { label: 'PID', value: String(process.pid) },
      { label: '平台', value: 'onebot' },
      { label: '端口', value: String(process.env.serverPort || '17119') }
    ],
    footer: 'mybot · status'
  }
}

export function statusText() {
  const mem = process.memoryUsage()
  return [
    'mybot 运行状态',
    `进程：node ${process.version}`,
    `已运行：${Math.floor(process.uptime())} 秒`,
    `内存：${mb(mem.rss)}`,
    `PID：${process.pid}`
  ].join('\n')
}
