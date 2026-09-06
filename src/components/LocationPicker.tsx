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
  /** Pulls results toward a known point — see searchPlaces. */
  bias?: { lat: number; lng: number } | null
}) {
  const listId = useId()
  const [query, setQuery] = useState(value)
  const [options, setOptions] = useState<GeocodeResult[]>([])
  const [open, setOpen] = useState(false)
  const [offline, setOffline] = useState(false)
  const controller = useRef<AbortController | null>(null)

  useEffect(() => setQuery(value), [value])

  useEffect(() => {
    const typed = query.trim()
    if (typed.length < 2 || typed === value) {
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
  }, [query, value, bias])

  function choose(option: GeocodeResult) {
    onChange(option.label)
    setQuery(option.label)
    setOpen(false)
  }

  return (
    <label htmlFor={id}>
      {label}
      <input
        id={id}
        value={query}
        placeholder={placeholder}
        autoComplete="off"
        role="combobox"
        aria-expanded={open && options.length > 0}
        aria-controls={listId}
        onChange={(event) => {
          setQuery(event.target.value)
          setOpen(true)
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
      />
      {offline ? (
        <small className="place-note">Place search is offline — known places still work.</small>
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
