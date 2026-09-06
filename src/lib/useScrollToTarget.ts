import { useEffect, useRef } from 'react'

/**
 * Scrolls to the element with id `targetId` once it is on the page, retrying
 * through the layout shifts that follow an async page load (history fetch,
 * contact lookups, map tiles). A single `scrollIntoView` fired on the first
 * render lands on a half-built page and misses.
 *
 * `ready` gates the first attempt until the data that renders the target has
 * arrived. Each distinct id is chased once; a repeat of the same id is ignored
 * so a user who scrolls away is not yanked back.
 */
export function useScrollToTarget(
  targetId: string | null | undefined,
  ready: boolean,
  onSettled?: () => void,
) {
  const chased = useRef<string | null>(null)
  const settledRef = useRef(onSettled)
  settledRef.current = onSettled

  useEffect(() => {
    if (!targetId || !ready || chased.current === targetId) return
    chased.current = targetId

    const delays = [0, 150, 400, 800, 1300]
    const timers = delays.map((delay, index) =>
      window.setTimeout(() => {
        document
          .getElementById(targetId)
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
        if (index === delays.length - 1) settledRef.current?.()
      }, delay),
    )

    return () => timers.forEach((timer) => window.clearTimeout(timer))
  }, [targetId, ready])
}
