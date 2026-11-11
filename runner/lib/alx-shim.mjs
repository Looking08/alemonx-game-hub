/**
 * 上游模块是云崽（Yunzai）插件，直接 import 了 `#components` 这类宿主别名。
 * 这里提供最小实现：配置一律回落到上游代码里的默认值，日志一律写 stderr
 * （stdout 是 ALX 插件协议的响应通道，绝不能污染）。
 */
export const Config = {
  getDefOrConfig: () => ({}),
  get: () => undefined
}

export const PluginData = {
  get: () => null,
  set: () => {},
  del: () => {}
}

const write = (level, args) => {
  try {
    process.stderr.write(`[game-hub][${level}] ${args.map(a => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ')}\n`)
  } catch {
    // stderr 不可写时不影响主流程
  }
}

export const logger = {
  trace: (...a) => write('trace', a),
  debug: (...a) => write('debug', a),
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  mark: (...a) => write('mark', a)
}
