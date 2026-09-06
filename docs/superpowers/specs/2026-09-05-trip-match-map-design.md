# CampusCarpool Trip-Match Map — Design

Status: proposed, awaiting team review
Branch: `feature/immersive-map`
Supersedes: `2026-09-05-immersive-map-design.md` (written against the old static
`DemoSite/` build; the app has since been rebuilt in React)

## Context

The repository currently holds two different applications:

| Track | Branches | Stack |
| --- | --- | --- |
| Static board | `main`, `web`, `create_requests` | `DemoSite/` HTML + JS |
| React rebuild | `harold(from-ben)`, `ben`, `feature/immersive-map` | React + Vite + TS + Supabase |

`create_requests` (Harold) adds ride requests, ride offers, seat reservation, a
profile page, ride history, and ratings to the static board. The React rebuild
(Ben) re-implements those same features in `src/` against a real Supabase schema
and deletes `DemoSite/`. Neither track has merged to `main`.

This work targets the React track and stays on `feature/immersive-map` so the
team can review it before deciding what merges where. It changes no file that
`create_requests` touches.

## Goal

Give a rider the shared leg of a trip that already exists.

Ride matching today requires both endpoints to line up: a rider searching
"Dexter Lawn to San Jose airport" never sees the driver going "SLO to San Jose"
even though the two routes run together for most of the way. This feature finds
those partial overlaps, ranks them, and names a public place where the two people
can meet.

This maps directly onto the CodeBox **10 Minutes Back** track: the product's own
output is a stated number of minutes returned to the user.

## Non-goals

- Replacing or restyling any existing page.
- Road-accurate routing, turn-by-turn navigation, or live vehicle tracking.
- Schema changes, migrations, or edits to the shared Supabase project.
- Payments, chat, or notifications.

## Success criteria

- A signed-in user picks an origin, destination, and departure time, and sees
  existing Supabase rides ranked by how much of their route is shared.
- Each match states its payoff in plain language: route share, walking time to
  the meetup point, and estimated minutes saved.
- The top match shows a named public meetup point on the map.
- Locations work outside San Luis Obispo. Nothing in the matching path is
  hardcoded to one campus.
- Deleting the map feature leaves the rest of the app behaving exactly as it
  does today.
- The primary flow runs on a projector-width screen and on a phone.

## Constraint: no schema change

`rides.origin` and `rides.destination` are free text. The map needs coordinates.
Adding `origin_lat`/`origin_lng` columns would be the cleanest long-term answer,
but it writes to the Supabase project the rest of the team is actively building
against, and a migration file is exactly what collides at merge time. So:

**Coordinates are derived from the existing text, never stored.**

`resolveLocation(text)` returns `{ lat, lng, label } | null` and tries, in order:

1. In-memory map for the session.
2. `localStorage` cache, keyed by the normalized text.
3. A bundled seed table of common campus and transit places.
4. A forward geocode against Photon (`photon.komoot.io`) — no API key, CORS
   enabled, worldwide coverage.
5. `null`.

A ride whose text does not resolve is not an error. It keeps appearing in the
normal rides list and is simply excluded from map matching.

The location picker writes the geocoder's **canonical place name** back into the
ordinary `origin`/`destination` text field, so a row created through the picker
re-resolves deterministically on read, and a teammate's code still reads an
ordinary string. If the team later adds coordinate columns, `resolveLocation`
becomes a column read and nothing above it changes.

## Match engine

A pure, network-free, deterministic function. This is the part that earns the
demo, so it is the part that gets tests.

Given a rider trip and a list of rides with resolved coordinates:

1. **Eligibility.** Drop rides with no open seat, rides the user drives or has
   already reserved, and rides departing outside the chosen window (default
   ±90 minutes).
2. **Direction.** Project the rider's origin and destination onto the driver's
   origin→destination segment, yielding parameters `t0` and `t1`. Require
   `t1 > t0`, so the rider travels the same way along the driver's route.
3. **Corridor.** Reject a ride if the rider's **origin** sits more than 5 km
   from the driver's segment — that is the distance the rider has to cover to
   meet the driver, and it is the one that has to stay small. The destination
   end is deliberately not limited: a driver who covers most of the route and
   drops the rider short is exactly the partial match this feature exists to
   surface, and step 4 already reflects how much of the trip they cover.
4. **Route share.** `routeMatch` is the length of the driver's segment between
   the clamped projections, divided by the rider's own trip length, capped at 1.
   A ride sharing less than 15% of the trip is dropped rather than offered.
5. **Score.** `0.60 * routeMatch + 0.25 * timeCloseness + 0.15 * seatHeadroom`.
   Ties break on departure time, then ride id, so ordering is stable.

Geometry is straight-line (haversine with an equirectangular projection for the
local math). Road routing is explicitly out of scope; the UI labels the number
**route match**, never an ETA.

## Meetup point

The suggested meetup is the projection of the rider's origin onto the driver's
segment, snapped to the nearest named public place within 1.2 km — drawn from the
seed table and a Photon reverse lookup, preferring transit stops and public
venues over arbitrary addresses. If nothing suitable is within range, the map
shows the raw projection labelled as an approximate point rather than inventing
a place name.

## The payoff number

"Minutes saved" is computed, not decorative, and rests on one stated assumption:
without a shared meetup, the rider would have to reach the driver's actual
origin, because that is how endpoint-matched ride boards work.

```
minutesSaved = travelTime(riderOrigin → driverOrigin) − walkTime(riderOrigin → meetup)
```

with straight-line distance × 1.3 for real-world path, walking at 5 km/h and
local travel at 30 km/h. The UI shows the assumption on hover and the figure is
labelled an estimate. A match whose computed saving is under 5 minutes is shown
without a savings claim rather than with a flattering one.

## Interface

A new **Map** tab beside Ride requests, Rides offered, and My profile. On a wide
screen the map takes roughly two thirds of the width with a ranked match panel
beside it. Below 900px the same components collapse into a map with a scrollable
match sheet underneath. One component tree, two layouts.

Selecting a match — from a card or from a map marker — highlights that route,
dims the others, drops the meetup pin, and fits the viewport to include the
rider's origin, the meetup, and the destination. Selection state is shared, so
card and map always agree.

Visual language extends the existing palette (`--green`, `--lime`, `--coral`,
`--mint`). The rider's own route is a dashed line; ride routes are solid and
distinguished by shape and label as well as color.

## Files

New:

- `src/map/geometry.ts` — haversine, projection, corridor distance
- `src/map/matchEngine.ts` — eligibility, scoring, ranking (pure)
- `src/map/meetup.ts` — meetup selection and payoff math (pure)
- `src/map/locations.ts` — seed table, cache, `resolveLocation`
- `src/map/geocode.ts` — debounced Photon client
- `src/map/MapCanvas.tsx` — Leaflet wrapper, imperative, no react-leaflet
- `src/components/LocationPicker.tsx` — reusable autocomplete
- `src/pages/MapPage.tsx` — state, layout, match panel
- `src/styles/map.css`

Modified — the complete list of shared-file edits:

- `src/components/Shell.tsx` — add `'map'` to the `View` union and one nav link
- `src/App.tsx` — one case in the view switch
- `package.json` — add `leaflet`, `@types/leaflet`, `vitest`

Each is a few lines and additive. Nothing existing changes behavior.

## Error and empty states

- Leaflet or tiles fail to load: the match panel still renders and stays usable;
  the map area shows a plain explanation.
- Geocoder unreachable: the seed table and cache still resolve; the picker says
  search is offline rather than appearing broken.
- A ride's text does not resolve: excluded from matching, still listed normally.
- Incomplete trip: name the missing field beside the control; do not match.
- No overlapping rides: show the nearest rides by time and say plainly that they
  do not overlap, rather than presenting them as matches.

## Accessibility

Every map action has a form or button equivalent. Match cards are real buttons.
Selection is exposed as text and ARIA state, not color alone. Route identity uses
label plus line style as well as color. Motion respects `prefers-reduced-motion`.

## Verification

Unit tests (vitest) on the pure modules:

- Eligibility filters seats, ownership, and departure window.
- Opposite-direction rides are rejected.
- Corridor distance rejects far-off endpoints.
- `routeMatch` is correct for a fully contained trip, a partial overlap, and a
  disjoint pair.
- Ranking is stable for tied scores.
- Meetup falls back to the raw projection when no named place is in range.
- Savings under the threshold produce no savings claim.
- `resolveLocation` prefers cache over network and returns null cleanly.

Manual checks: full flow at desktop and 375px width; selection sync in both
directions; tile-failure and geocoder-failure paths; keyboard-only pass.

## Delivery order

Each step ends committed and working, so there is always something deployable.

1. Leaflet canvas, seed locations, `resolveLocation`, rides plotted from live
   Supabase data. **Deploy here.**
2. Location picker, rider trip entry, rider route drawn.
3. Match engine plus tests, ranked cards, synchronized selection.
4. Meetup point and payoff line.
5. Responsive collapse, error states, accessibility, polish.

## Open questions for the team

1. **Judge access.** Sign-up is restricted to `@calpoly.edu` (`src/auth/auth.ts`).
   Submission requires a publicly demonstrable deployment, and a judge without a
   Cal Poly address cannot get in. The team needs either a demo account published
   in the Devpost write-up or a relaxed domain rule. This is a submission-level
   risk independent of the map.
2. **Deployment owner.** No live deployment exists yet. Vercel with the two
   `VITE_SUPABASE_*` env vars is about fifteen minutes of work and should happen
   early, not on Sunday afternoon.
3. **Merge target.** This branch assumes the React track wins. If the team ships
   the static board instead, this work does not carry over.
