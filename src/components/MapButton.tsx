/** Opens the map view. Sits in the toolbar beside search and refresh. */
export default function MapButton({ onClick }: { onClick: () => void }) {
  return (
    <button className="secondary map-button" type="button" onClick={onClick} aria-label="Open map">
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
        <path
          d="M9 4 3 6.5v13L9 17l6 2.5 6-2.5v-13L15 6.5 9 4Z"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinejoin="round"
        />
        <path d="M9 4v13M15 6.5v13" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
      </svg>
    </button>
  )
}
