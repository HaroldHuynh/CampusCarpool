import { useCallback, useEffect, useRef, useState } from 'react'
import { ratingLabel } from '../components/Shell'
import { fetchProfileCard, type CampusProfile } from '../data/api'
import {
  MESSAGE_MAX_LENGTH,
  fetchConversation,
  fetchMessageThreads,
  markConversationRead,
  sendDirectMessage,
  type DirectMessage,
  type MessagePeer,
  type MessageThread,
} from '../data/messages'
import { getSupabaseClient } from '../lib/supabase'

export type MessageTarget = MessagePeer

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? '')
    .join('')
}

function messageTime(value: string) {
  const date = new Date(value)
  const today = new Date()
  const sameDay = date.toDateString() === today.toDateString()

  return sameDay
    ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
    : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

export default function MessagesPage({
  profile,
  initialRecipient,
  onInitialRecipientHandled,
  onUnreadChange,
}: {
  profile: CampusProfile
  initialRecipient: MessageTarget | null
  onInitialRecipientHandled: () => void
  onUnreadChange: () => void
}) {
  const [threads, setThreads] = useState<MessageThread[]>([])
  const [selectedPeer, setSelectedPeer] = useState<MessagePeer | null>(null)
  const [messages, setMessages] = useState<DirectMessage[]>([])
  const [draft, setDraft] = useState('')
  const [isLoadingThreads, setIsLoadingThreads] = useState(true)
  const [isLoadingMessages, setIsLoadingMessages] = useState(false)
  const [isSending, setIsSending] = useState(false)
  const [error, setError] = useState('')
  const selectedId = useRef<string | null>(null)
  const messageEnd = useRef<HTMLDivElement>(null)
  const composer = useRef<HTMLTextAreaElement>(null)
  const unreadChange = useRef(onUnreadChange)

  useEffect(() => {
    unreadChange.current = onUnreadChange
  }, [onUnreadChange])

  const loadThreads = useCallback(async () => {
    try {
      const rows = await fetchMessageThreads()
      setThreads(rows)
      setSelectedPeer((current) => {
        if (current) {
          const refreshed = rows.find((row) => row.profile_id === current.profile_id)
          return refreshed ?? current
        }
        return rows[0] ?? null
      })
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load messages.')
    } finally {
      setIsLoadingThreads(false)
    }
  }, [])

  const loadConversation = useCallback(async (profileId: string) => {
    setIsLoadingMessages(true)
    try {
      const rows = await fetchConversation(profileId)
      setMessages(rows)
      await markConversationRead(profileId)
      await loadThreads()
      unreadChange.current()
      setError('')
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load this conversation.')
    } finally {
      setIsLoadingMessages(false)
    }
  }, [loadThreads])

  useEffect(() => {
    void loadThreads()
  }, [loadThreads])

  useEffect(() => {
    if (!initialRecipient) return
    const fromThread = threads.find((thread) => thread.profile_id === initialRecipient.profile_id)
    setSelectedPeer(fromThread ?? initialRecipient)
    onInitialRecipientHandled()
  }, [initialRecipient, onInitialRecipientHandled, threads])

  useEffect(() => {
    const profileId = selectedPeer?.profile_id ?? null
    selectedId.current = profileId
    if (profileId) void loadConversation(profileId)
    else setMessages([])
  }, [selectedPeer?.profile_id, loadConversation])

  useEffect(() => {
    messageEnd.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  useEffect(() => {
    const supabase = getSupabaseClient()
    const channel = supabase
      .channel(`direct-messages-${profile.id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'direct_messages' }, () => {
        void loadThreads()
        if (selectedId.current) void loadConversation(selectedId.current)
        else unreadChange.current()
      })
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [loadConversation, loadThreads, profile.id])

  async function handleSend(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!selectedPeer || isSending) return

    setIsSending(true)
    setError('')
    try {
      await sendDirectMessage(selectedPeer.profile_id, draft)
      setDraft('')
      await loadConversation(selectedPeer.profile_id)
      composer.current?.focus()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not send that message.')
    } finally {
      setIsSending(false)
    }
  }

  async function startConversation(profileId: string, displayName: string) {
    const thread = threads.find((item) => item.profile_id === profileId)
    if (thread) {
      setSelectedPeer(thread)
      return
    }

    try {
      const card = await fetchProfileCard(profileId)
      setSelectedPeer({
        profile_id: profileId,
        display_name: card.display_name || displayName,
        rating_average: card.rating_average,
        rating_count: card.rating_count,
      })
    } catch {
      setSelectedPeer({
        profile_id: profileId,
        display_name: displayName,
        rating_average: 0,
        rating_count: 0,
      })
    }
  }

  return (
    <main className="messages-page">
      <header className="messages-page-head">
        <p className="eyebrow">DIRECT MESSAGES</p>
        <h1>Messages</h1>
        <p>Plan pickup details directly with another CampusCarpool member.</p>
      </header>

      <section className="messages-shell" aria-label="Direct messages">
        <aside className="message-threads" aria-label="Conversations">
          <div className="message-panel-head">
            <strong>Conversations</strong>
            {threads.length ? <span>{threads.length}</span> : null}
          </div>

          <div className="message-thread-list">
            {isLoadingThreads ? <p className="message-empty">Loading conversations…</p> : null}
            {!isLoadingThreads && threads.length === 0 ? (
              <p className="message-empty">Open a member’s profile to start a conversation.</p>
            ) : null}
            {threads.map((thread) => (
              <button
                type="button"
                className={`message-thread${selectedPeer?.profile_id === thread.profile_id ? ' active' : ''}`}
                key={thread.profile_id}
                onClick={() => void startConversation(thread.profile_id, thread.display_name)}
              >
                <span className="message-avatar">{initials(thread.display_name)}</span>
                <span className="message-thread-copy">
                  <span><strong>{thread.display_name}</strong><time>{messageTime(thread.last_message_at)}</time></span>
                  <small>{thread.last_message}</small>
                </span>
                {thread.unread_count > 0 ? <i aria-label={`${thread.unread_count} unread`}>{thread.unread_count}</i> : null}
              </button>
            ))}
          </div>
        </aside>

        <div className="message-conversation">
          {selectedPeer ? (
            <>
              <div className="message-conversation-head">
                <span className="message-avatar">{initials(selectedPeer.display_name)}</span>
                <span>
                  <strong>{selectedPeer.display_name}</strong>
                  <small>{ratingLabel(selectedPeer)}</small>
                </span>
              </div>

              <div className="message-log" role="log" aria-live="polite" aria-label={`Conversation with ${selectedPeer.display_name}`}>
                {isLoadingMessages && messages.length === 0 ? <p className="message-empty">Loading messages…</p> : null}
                {!isLoadingMessages && messages.length === 0 ? (
                  <p className="message-empty">No messages yet. Say hello to {selectedPeer.display_name}.</p>
                ) : null}
                {messages.map((message) => {
                  const mine = message.sender_profile_id === profile.id
                  return (
                    <div className={`message-row${mine ? ' mine' : ''}`} key={message.id}>
                      <div className="message-bubble">
                        <p>{message.body}</p>
                        <time>{messageTime(message.created_at)}</time>
                      </div>
                    </div>
                  )
                })}
                <div ref={messageEnd} />
              </div>

              <form className="message-composer" onSubmit={handleSend}>
                <label className="sr-only" htmlFor="direct-message">Message {selectedPeer.display_name}</label>
                <textarea
                  id="direct-message"
                  ref={composer}
                  value={draft}
                  maxLength={MESSAGE_MAX_LENGTH}
                  rows={2}
                  placeholder={`Message ${selectedPeer.display_name}`}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                      event.preventDefault()
                      event.currentTarget.form?.requestSubmit()
                    }
                  }}
                />
                <div>
                  <small>{draft.length > 850 ? `${draft.length}/${MESSAGE_MAX_LENGTH}` : 'Enter to send · Shift+Enter for a new line'}</small>
                  <button className="primary" type="submit" disabled={!draft.trim() || isSending}>
                    {isSending ? 'Sending…' : 'Send'} <span>→</span>
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="message-welcome">
              <span className="brand-mark">↗</span>
              <h2>Your conversations</h2>
              <p>Choose a conversation or open someone’s profile to send a message.</p>
            </div>
          )}
        </div>
      </section>

      {error ? <p className="messages-error" role="alert">{error}</p> : null}
    </main>
  )
}
