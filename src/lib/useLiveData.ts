import { useEffect, useRef } from 'react'
import { getSupabaseClient } from './supabase'

/** Tables whose changes should refresh a board. */
const TABLES = [
  'rides',
  'ride_requests',
  'ride_reservations',
  'user_ratings',
  'campus_profiles',
] as const

/**
 * Re-runs `reload` whenever anyone changes a ride, request or seat, so the
 * boards and the notification bell stay current without a refresh button.
 *
 * Postgres changes arrive per row, and one action often touches several rows
 * at once — offering on a request writes a ride, a reservation and the request
 * itself. Reloading on each would fire three overlapping fetches, so events are
 * coalesced into a single reload shortly after the last one.
 */
export function useLiveData(reload: () => void, channelName: string) {
  const latest = useRef(reload)
  latest.current = reload

  useEffect(() => {
    const supabase = getSupabaseClient()
    let timer: number | undefined

    const channel = supabase.channel(channelName)

    for (const table of TABLES) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        window.clearTimeout(timer)
        timer = window.setTimeout(() => latest.current(), 250)
      })
    }

    channel.subscribe()

    return () => {
      window.clearTimeout(timer)
      supabase.removeChannel(channel)
    }
  }, [channelName])
}
