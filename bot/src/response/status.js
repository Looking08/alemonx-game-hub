import { useMessage } from 'alemonjs'
import { sendCard } from '../game/send.mjs'
import { statusModel, statusText } from '../game/cards-response.mjs'

export default async () => {
  const [message] = useMessage()
  await sendCard(message, { model: statusModel(), text: statusText() })
}
