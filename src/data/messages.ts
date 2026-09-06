import { getSupabaseClient } from '../lib/supabase'

export const MESSAGE_MAX_LENGTH = 1000

export type MessagePeer = {
  profile_id: string
  display_name: string
  rating_average: number
  rating_count: number
}

export type MessageThread = MessagePeer & {
  last_message: string
  last_message_at: string
  unread_count: number
}

export type DirectMessage = {
  id: string
  sender_profile_id: string
  recipient_profile_id: string
  body: string
  created_at: string
  read_at: string | null
}

export function prepareMessageBody(value: string) {
  const body = value.trim()
  if (!body) throw new Error('Write a message first.')
  if (body.length > MESSAGE_MAX_LENGTH) {
    throw new Error(`Messages can be up to ${MESSAGE_MAX_LENGTH} characters.`)
  }
  return body
}

export async function fetchMessageThreads(): Promise<MessageThread[]> {
  const { data, error } = await getSupabaseClient().rpc('get_message_threads')
  if (error) throw error

  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    profile_id: String(row.profile_id),
    display_name: String(row.display_name),
    rating_average: Number(row.rating_average),
    rating_count: Number(row.rating_count),
    last_message: String(row.last_message),
    last_message_at: String(row.last_message_at),
    unread_count: Number(row.unread_count),
  }))
}

export async function fetchConversation(profileId: string): Promise<DirectMessage[]> {
  const { data, error } = await getSupabaseClient().rpc('get_direct_conversation', {
    target_profile_id: profileId,
  })
  if (error) throw error
  return (data ?? []) as DirectMessage[]
}

export async function sendDirectMessage(profileId: string, value: string) {
  const body = prepareMessageBody(value)
  const { data, error } = await getSupabaseClient().rpc('send_direct_message', {
    target_profile_id: profileId,
    message_body: body,
  })
  if (error) throw error
  return data as string
}

export async function markConversationRead(profileId: string) {
  const { error } = await getSupabaseClient().rpc('mark_direct_messages_read', {
    target_profile_id: profileId,
  })
  if (error) throw error
}

export async function fetchUnreadMessageCount() {
  const { data, error } = await getSupabaseClient().rpc('get_unread_message_count')
  if (error) throw error
  return Number(data ?? 0)
}
