import { useMessage } from 'alemonjs'
import { sendCard } from '../game/send.mjs'
import { pingModel, pingText } from '../game/cards-response.mjs'

export default async () => {
  const [message] = useMessage()
  await sendCard(message, { model: pingModel(), text: pingText() })
}
