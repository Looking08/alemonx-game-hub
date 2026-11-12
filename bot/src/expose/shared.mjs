/**
 * Expose 辅助层：授权绑定 + schema 小工具 + 两类动作包装。
 *
 * 参考 alemonjs-roco（洛克王国插件）的模式：
 *  - 身份来自「当前正在处理的消息事件」：谁触发了调用链，就查谁的账号，
 *    没有 callerApp / 消息身份的调用一律拒绝（防越权代查）；
 *  - 配置开关写在 alemon.config.yaml 的 game-hub.expose 下（默认开启）；
 *  - query() 返回 { status, text, data }，data 是卡片模型的 JSON 字符串
 *    （模型字段随卡片种类变化，用字符串承载契约最诚实，消费方自行 JSON.parse）。
 */
import { Expose, ExposeError, getCurrentEvent, getConfigValue } from 'alemonjs'
import { userKeyOf } from '../game/hub.mjs'

/* ---------------- schema 小工具（框架只支持 JSON Schema 子集） ---------------- */

export const emptyInput = { type: 'object', properties: {}, additionalProperties: false }

export const str = (description, extra = {}) => ({ type: 'string', ...(description ? { description } : {}), ...extra })
export const int = (description, extra = {}) => ({ type: 'integer', ...(description ? { description } : {}), ...extra })

export function obj(properties, required) {
  return { type: 'object', properties, ...(required?.length ? { required } : {}), additionalProperties: false }
}

export const textOutput = obj(
  {
    status: { type: 'string', enum: ['success', 'error'] },
    text: str('给用户看的摘要；status=error 时是失败原因'),
    data: str('成功时为卡片模型的 JSON 字符串（结构随动作不同），失败为空串')
  },
  ['status', 'text', 'data']
)

/* ---------------- 配置与授权 ---------------- */

/**
 * 读 alemon.config.yaml：
 *   game-hub:
 *     expose:
 *       enabled: true          # 总开关，默认 true
 *       allowed_callers: []    # 允许的调用方插件名（callerApp），留空/缺省 = 不限
 */
function exposeConfig() {
  const root = safe(() => getConfigValue()) || {}
  const conf = root['game-hub']?.expose
  if (conf !== undefined && (conf === null || typeof conf !== 'object' || Array.isArray(conf))) {
    throw new ExposeError('FORBIDDEN', 'game-hub.expose 配置格式不正确（应为对象）')
  }
  const enabled = conf?.enabled !== false
  const allowed = conf?.allowed_callers
  if (allowed !== undefined && !(Array.isArray(allowed) && allowed.every(v => typeof v === 'string' && v.trim() && v.trim() === v))) {
    throw new ExposeError('FORBIDDEN', 'game-hub.expose.allowed_callers 应为非空字符串数组')
  }
  return { enabled, allowed }
}

const safe = fn => {
  try {
    return fn()
  } catch {
    return undefined
  }
}

/**
 * 校验调用上下文并解析出当前用户身份。
 * 拒绝：配置关闭、调用方不在白名单、没有 callerApp（顶层直接调用）、
 * 不在消息事件里（Expose 不创建聊天上下文，扫码登录这类交互流程走聊天指令）。
 */
export function currentUser(context) {
  const { enabled, allowed } = exposeConfig()
  if (!enabled) throw new ExposeError('FORBIDDEN', 'game-hub 的 expose 能力已被配置关闭')
  if (allowed && !context.callerApp) throw new ExposeError('FORBIDDEN', '本动作不允许无插件身份的调用')
  if (allowed && !allowed.includes(context.callerApp)) {
    throw new ExposeError('FORBIDDEN', `调用方 ${context.callerApp} 不在 game-hub.expose.allowed_callers 白名单内`)
  }
  const event = getCurrentEvent()
  if (
    !event ||
    !['message.create', 'private.message.create'].includes(event.name) ||
    ![event.Platform, event.BotId, event.UserId].every(v => typeof v === 'string' && v.trim())
  ) {
    throw new ExposeError('FORBIDDEN', '需要从聊天消息内发起调用（按消息主人查询其账号）')
  }
  context.signal?.throwIfAborted?.()
  return userKeyOf(event)
}

/* ---------------- 动作包装 ---------------- */

/**
 * 文本型查询动作：handler(input, userKey) → { text, model? }。
 * 业务失败不抛异常，落进 { status: 'error', text }（登录失效、未登录等对调用方是可读结果）。
 */
export function query(description, inputSchema, handler, effect = 'read') {
  return Expose.action({
    description,
    effect,
    inputSchema,
    outputSchema: textOutput,
    authorize: (_input, context) => {
      currentUser(context)
      return true
    },
    handler: async (input, context) => {
      const userKey = currentUser(context)
      try {
        const result = await handler(input, userKey)
        return {
          status: 'success',
          text: String(result?.text ?? ''),
          data: result?.model === undefined ? '' : safeJson(result.model)
        }
      } catch (e) {
        return { status: 'error', text: String(e?.message || e || '查询失败'), data: '' }
      }
    }
  })
}

/** 结构化查询动作（字段形状稳定的小输出用这个，消费方拿真 JSON） */
export function dataQuery(description, inputSchema, outputSchema, handler, effect = 'read') {
  return Expose.action({
    description,
    effect,
    inputSchema,
    outputSchema,
    authorize: (_input, context) => {
      currentUser(context)
      return true
    },
    handler: (input, context) => handler(input, currentUser(context))
  })
}

const safeJson = value => {
  try {
    return JSON.stringify(value)
  } catch {
    return ''
  }
}
