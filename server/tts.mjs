const fail = (status, message) => {
  throw Object.assign(new Error(message), { status })
}

/** Synthesize speech via OpenAI TTS. Requires OPENAI_API_KEY. */
export async function synthesizeSpeech(text) {
  const key = process.env.OPENAI_API_KEY
  if (!key) fail(503, 'Синтез речи не настроен (нет OPENAI_API_KEY)')
  const voice = process.env.PADMA_TTS_VOICE || 'alloy'
  const res = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'tts-1',
      input: text.slice(0, 200),
      voice,
      response_format: 'mp3',
    }),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    fail(
      502,
      detail
        ? `Не удалось синтезировать речь (${res.status})`
        : 'Не удалось синтезировать речь',
    )
  }
  const buf = Buffer.from(await res.arrayBuffer())
  if (!buf.length) fail(502, 'Пустой ответ синтеза речи')
  return { data: buf, mime: 'audio/mpeg' }
}
