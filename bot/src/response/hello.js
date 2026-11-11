import { useEvent, useMessage } from 'alemonjs'
import { sendCard } from '../game/send.mjs'
import { helloModel, helloText } from '../game/cards-response.mjs'

export default async () => {
  const [event] = useEvent({ selects: ['message.create'] })
  const [message] = useMessage()
  const current = event?.current ?? {}
  const name = current.UserName || current.UserId || '你'

  await sendCard(message, { model: helloModel(name), text: helloText(name) })
}
