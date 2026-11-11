import { useMessage } from 'alemonjs'
import { sendCard } from '../game/send.mjs'
import { helpModel, helpText } from '../game/cards-response.mjs'

export default async () => {
  const [message] = useMessage()
  await sendCard(message, { model: helpModel(), text: helpText() })
}
