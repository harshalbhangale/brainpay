import { env } from './env'
import { supabase } from './supabase'

/**
 * WebSocket client for the live camera session.
 * See: Detailed Spec § 4.4 + Build Deck § 6.
 *
 * Reconnect backoff (locked in Build Deck § 9.2): 1s/2s/4s/8s/16s capped.
 */

export type LiveSocket = {
  send: (data: ArrayBuffer | string) => void
  close: () => void
}

export async function connectLive(
  onMessage: (data: ArrayBuffer | string) => void,
): Promise<LiveSocket> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('not_authenticated')

  const ws = new WebSocket(`${env.wsUrl}?token=${session.access_token}`)
  ws.binaryType = 'arraybuffer'

  ws.onmessage = (e) => onMessage(e.data)
  // TODO(day-7): exponential reconnect 1/2/4/8/16, resume seamlessly.

  return {
    send: (data) => ws.send(data),
    close: () => ws.close(),
  }
}
