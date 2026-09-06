type Action = { label: string; onClick: () => void }

/**
 * One compact banner for both boards. The tall illustrated hero was fine as a
 * landing page but this is a tool people open repeatedly . it pushed the
 * actual listings below the fold every visit.
 *
 * Each board leads with its own primary action and links across to the other,
 * so a driver and a rider both land somewhere sensible.
 */
function PageBanner({
  eyebrow,
  title,
  primary,
  secondary,
}: {
  eyebrow: string
  title: string
  primary: Action
  secondary: Action
}) {
  return (
    <section className="board-banner">
      <div className="board-banner-copy">
        <p className="eyebrow">{eyebrow}</p>
        <h1>{title}</h1>
      </div>

      <div className="board-banner-actions">
        <button className="primary" type="button" onClick={primary.onClick}>
          {primary.label} <span aria-hidden="true">→</span>
        </button>
        <button className="board-banner-link" type="button" onClick={secondary.onClick}>
          {secondary.label}
        </button>
      </div>
    </section>
  )
}

export default PageBanner
