/**
 * MoneyHome — the structured "Money" UI section (the counterpart to chat).
 * Reuses the inline HomeCards (balance, chores, goal, activity, study, map).
 * Asking a question jumps to the chat and sends it, so the UI and the chat are
 * two views of the same brain.
 */
import { TopBar } from '../components/shell'
import { HomeCards } from './HomeCards'
import { useNav } from '../lib/useNav'
import { sendAiCommand } from '../pals/aiBus'

export function MoneyHome() {
  const setSection = useNav((s) => s.setSection)

  function ask(text: string) {
    setSection('chat')
    sendAiCommand({ type: 'ask', text })
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <TopBar leading={<h1 className="pv-h1 pv-tight">Money</h1>} />
      <div className="pv-no-scrollbar min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-1">
        <div className="mx-auto w-full max-w-2xl">
          <HomeCards onAsk={ask} />
        </div>
      </div>
    </div>
  )
}
