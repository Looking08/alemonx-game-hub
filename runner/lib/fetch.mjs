/**
 * node-fetch 兼容层：上游模块（王者/和平）用的是 node-fetch v2 的调用风格，
 * 这里用 Node 18+ 的全局 fetch 兜住，补上 { timeout } 选项。
 */
const realFetch = globalThis.fetch

export default function fetch(input, init = {}) {
  const options = { ...init }
  const timeout = Number(options.timeout || 0)
  delete options.timeout
  if (timeout > 0 && !options.signal) {
    options.signal = AbortSignal.timeout(timeout)
  }
  return realFetch(input, options)
}

export { realFetch as fetch }
