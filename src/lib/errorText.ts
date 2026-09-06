/**
 * Pulls a human-readable string out of whatever a Supabase/PostgREST call
 * rejects with. A PostgrestError extends Error, but network failures and RPC
 * errors can arrive as plain objects ({ message, details, hint, code }), which
 * `error instanceof Error` misses - so the UI would fall back to a generic
 * "something went wrong" and hide the real reason (often in `hint`).
 */
/**
 * Normalizes anything thrown by Supabase into a real Error. PostgREST/RPC
 * failures come back as plain `{ message, details, hint, code }` objects, which
 * fail `instanceof Error` and lose their message on the way to the UI.
 */
export function asError(error: unknown, fallback = 'Something went wrong.'): Error {
  if (error instanceof Error) {
    return error
  }

  return new Error(errorText(error, fallback))
}

export function errorText(error: unknown, fallback: string): string {
  if (typeof error === 'string' && error.trim()) {
    return error
  }

  if (error && typeof error === 'object') {
    const record = error as Record<string, unknown>
    const parts = [record.message, record.hint, record.details]
      .filter((part): part is string => typeof part === 'string' && part.trim() !== '')

    if (parts.length > 0) {
      // De-dupe: message and hint are sometimes identical.
      return [...new Set(parts)].join(' — ')
    }
  }

  return fallback
}
