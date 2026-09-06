import { useEffect, useId, useRef, useState } from 'react'
import { searchPlaces, type GeocodeResult } from '../map/geocode'
import { SEED_PLACES } from '../map/locations'

function seedMatches(query: string): GeocodeResult[] {
  const q = query.trim().toLowerCase()
  if (!q) return []
  return SEED_PLACES.filter((place) => place.label.toLowerCase().includes(q))
    .slice(0, 5)
    .map((place) => ({
      lat: place.lat,
      lng: place.lng,
      label: place.label,
      category: place.category,
    }))
}

export default function LocationPicker({
  id,
  label,
  value,
  onChange,
  placeholder,
  bias,
}: {
  id: string
  label: string
  value: string
  onChange: (label: string) => void
  placeholder?: string
  /** Pulls results toward a known point . see searchPlaces. */
  bias?: { lat: number; lng: number } | null
}) {
  const listId = useId()
  const [options, setOptions] = useState<GeocodeResult[]>([])
  const [open, setOpen] = useState(false)
  const [offline, setOffline] = useState(false)
  const controller = useRef<AbortController | null>(null)
  const picked = useRef(false)

  useEffect(() => {
    // A chosen suggestion is already canonical . don't search for it again.
    if (picked.current) {
      picked.current = false
      setOptions([])
      return
    }

    const typed = value.trim()
    if (typed.length < 2) {
      setOptions([])
      return
    }

    const seeds = seedMatches(typed)
    setOptions(seeds)

    const timer = setTimeout(() => {
      controller.current?.abort()
      const next = new AbortController()
      controller.current = next

      searchPlaces(typed, next.signal, bias ?? undefined)
        .then((remote) => {
          setOffline(false)
          const seen = new Set(seeds.map((s) => s.label))
          setOptions([...seeds, ...remote.filter((r) => !seen.has(r.label))].slice(0, 7))
        })
        .catch((error: unknown) => {
          if (error instanceof DOMException && error.name === 'AbortError') return
          setOffline(true)
        })
    }, 300)

    return () => clearTimeout(timer)
  }, [value, bias])

  function choose(option: GeocodeResult) {
    picked.current = true
    onChange(option.label)
    setOpen(false)
  }

  return (
    <label className="trip-field" htmlFor={id}>
      <span>{label}</span>
      <input
        id={id}
        value={value}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        aria-autocomplete="list"
        onChange={(event) => {
          // Keep the parent in step with every keystroke: a trip typed out in
          // full is still a trip, even if nobody opens the suggestion list.
          onChange(event.target.value)
          setOpen(true)
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {offline ? (
        <small className="picker-note">Place search is offline. Known places still work.</small>
      ) : null}
      {open && options.length > 0 ? (
        <ul id={listId} className="picker-options" role="listbox">
          {options.map((option) => (
            <li key={`${option.label}-${option.lat}`} role="option" aria-selected={false}>
              <button
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.label}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </label>
  )
}
