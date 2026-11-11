/**
 * 统一的出图入口：卡片模型 → PNG → 发出去。
 *
 * 两条发送通道：
 *   sendCard   —— 回复当前消息（指令的直接结果）
 *   pushCard   —— 主动发到指定会话（登录流程里后台轮询的结果）
 *
 * 两条都带文本兜底，渲染失败也不至于没反应。
 */
import { Format, MessageDirect } from 'alemonjs'
import { cardHtml } from './render/card.mjs'
import { renderHtmlToPng } from './render/shot.mjs'

async function renderPng(model) {
  const { html, width, height } = cardHtml(model)
  // 二维码等需要无损的卡片在 model 上标 png:true，其余默认 JPEG（体积小 3~5 倍）
  return renderHtmlToPng(html, { width, height, format: model.png ? 'png' : 'jpeg' })
}

function imageFormat(png) {
  const format = Format.create()
  format.addImage(png)
  return format
}

function textFormat(text) {
  const format = Format.create()
  format.addText(String(text ?? ''))
  return format
}

export async function sendCard(message, payload) {
  // payload 可能是视图函数返回的 Promise（loginQrCard 就是 async），统一 await 掉
  const { model, text } = (await payload) || {}
  if (!model) {
    await message.send({ format: textFormat(text || '（空结果）') })
    return
  }
  try {
    await message.send({ format: imageFormat(await renderPng(model)) })
  } catch (error) {
    console.error('[card] 渲染失败，回退文本：', error?.message || error)
    await message.send({ format: textFormat(text || model.title || '渲染失败') })
  }
}

/** 主动推送（登录结果用），onebot 只支持 channel / user 两种 */
export async function pushCard(target, payload) {
  if (!target?.targetId) return
  const { model, text } = (await payload) || {}
  const direct = MessageDirect.create()
  const send = format =>
    target.scope === 'group'
      ? direct.sendToChannel({ SpaceId: target.targetId, format })
      : direct.sendToUser({ OpenID: target.targetId, format })

  if (!model) {
    await send(textFormat(text || ''))
    return
  }
  try {
    await send(imageFormat(await renderPng(model)))
  } catch (error) {
    console.error('[card] 渲染失败，回退文本：', error?.message || error)
    await send(textFormat(text || model.title || '渲染失败'))
  }
}
