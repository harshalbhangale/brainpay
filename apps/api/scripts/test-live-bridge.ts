// Integration test: exercise the Gemini Live service the way the bridge does.
// Sends a simulated user turn and verifies tool-call (report_item) + audio out.
import { connectLiveSession } from '../src/services/gemini-live'

let audioBytes = 0
let toolCalled = false
let transcript = ''

const session = await connectLiveSession('kid', {
  onmessage: (m) => {
    const calls = m.toolCall?.functionCalls
    if (calls?.length) {
      for (const c of calls) {
        if (c.name === 'report_item') {
          toolCalled = true
          console.log('✅ report_item:', JSON.stringify(c.args))
        }
      }
      session.sendToolResponse({
        functionResponses: calls.map((c) => ({ id: c.id, name: c.name ?? 'report_item', response: { result: 'ok' } })),
      })
    }
    const sc = m.serverContent
    if (sc?.outputTranscription?.text) transcript += sc.outputTranscription.text
    const parts = sc?.modelTurn?.parts ?? []
    for (const p of parts) {
      if (p.inlineData?.data && p.inlineData.mimeType?.startsWith('audio/')) {
        audioBytes += Buffer.from(p.inlineData.data, 'base64').length
      }
    }
    if (sc?.turnComplete) {
      console.log(`✅ turn complete. transcript="${transcript.trim()}" audioBytes=${audioBytes} toolCalled=${toolCalled}`)
      session.close()
      setTimeout(() => process.exit(toolCalled && audioBytes > 0 ? 0 : 1), 200)
    }
  },
  onerror: (e: any) => { console.error('❌ error', e?.message ?? e) },
  onclose: () => {},
})

// Simulate the user telling PAL what they're holding (stands in for a video frame).
session.sendClientContent({
  turns: [{ role: 'user', parts: [{ text: 'I am holding up a 375ml can of Coca-Cola Classic. React and report it.' }] }],
  turnComplete: true,
})

setTimeout(() => { console.error('❌ timeout'); process.exit(1) }, 20000)
