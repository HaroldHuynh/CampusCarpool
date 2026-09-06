# CampusCarpool Smart Route Map Design

## Goal

Turn the existing static CampusCarpool landing page into a convincing hackathon demo centered on one clear promise: a rider can choose where and when they are traveling, see compatible rides on a map, and understand the best shared pickup point in seconds.

The product vision can support any campus or community. The hackathon implementation will use a small local dataset and a polished scheduled-trip flow so the team can finish, deploy, and rehearse before submissions close.

## Success Criteria

- A first-time visitor can understand the map without instructions.
- A user can set an origin and destination by clicking the map or using the existing trip form.
- The interface displays multiple scheduled rides and visually distinguishes their routes.
- Selecting a ride reveals the driver, schedule, price, seats, route match, walking time, driver detour, and estimated time saved.
- The best match includes a clearly marked suggested meetup point.
- All core interactions work on desktop and mobile without a backend.
- The demo remains usable if geolocation is denied or map tiles fail.

## Scope

### Included

- Leaflet map with OpenStreetMap tiles loaded from public CDNs.
- Origin and destination pins controlled by both the map and trip form.
- Five to eight scheduled rides stored in local JavaScript.
- Predefined route coordinate arrays for deterministic, reliable rendering.
- Ride lines, clickable markers, and synchronized result cards.
- A lightweight compatibility score based on route proximity, departure-time difference, and seat availability.
- A suggested meetup point selected from safe public locations in the local dataset.
- Filters for departure window and available seats.
- A results summary showing match percentage and time-saving metrics.
- Responsive layouts and keyboard-accessible controls.
- A map-loading fallback message with the ride list still available.

### Excluded

- Accounts, authentication, payments, and chat.
- Persistent storage or a production backend.
- Real-time vehicle tracking.
- Turn-by-turn navigation.
- Production geocoding, nationwide ride inventory, or dynamically generated road routes.
- AI-generated recommendations.

## Primary User Flow

1. The visitor reaches the existing page and sees a new map-focused trip planner below the hero.
2. The visitor chooses **Find a ride**, enters a scheduled departure time, and sets an origin and destination. Clicking the map alternates between placing origin and destination pins; the form offers a few reliable demo locations.
3. The map draws the requested trip and displays compatible scheduled rides.
4. The results drawer ranks rides by compatibility. Route colors on the map match the corresponding cards.
5. Selecting a result emphasizes that ride, dims the others, and opens its details.
6. The map displays a suggested public meetup pin and the walking segment from the rider's origin.
7. The detail panel explains the value in plain language, such as: **92% route match · 8-minute walk · 4-minute driver detour · 17 minutes saved**.
8. The visitor selects **Request this ride** and receives a demo confirmation toast. No request is persisted.

## Experience Design

The map and results form one shared workspace. On desktop, the map occupies roughly two thirds of the width and the ride results appear in a side drawer. On mobile, the map sits above a horizontally scrollable result list or collapsible bottom sheet.

The visual language will extend the existing cream, forest-green, lime, and coral palette. Rider routes use a strong green line, available rides use distinct but harmonious colors, and unselected routes become partially transparent. Origin, destination, driver, and meetup markers use different shapes or icons as well as color so they remain understandable without color perception.

Motion is brief and functional: routes draw into view, the selected card lifts slightly, and the map pans to include the selected ride and meetup point. Reduced-motion preferences disable these transitions.

## Components and Responsibilities

### Map Controller

Owns Leaflet initialization, markers, route layers, selection highlighting, viewport fitting, and tile-load failure handling. It receives normalized trip and ride data and emits semantic events such as `location-selected` and `ride-selected`.

### Trip Planner

Extends the existing form with departure time and map-selection state. It validates that the user has distinct origin and destination points before requesting matches.

### Ride Repository

Exports the local ride dataset, demo locations, predefined routes, safe meetup points, and driver metadata. Keeping data separate from rendering makes it straightforward to replace with an API after the hackathon.

### Match Engine

Ranks rides deterministically. A ride must have an available seat and fall within the selected departure window. Its displayed score combines route proximity and time proximity. It also selects the closest eligible meetup point and returns already-defined demo metrics for walking time, detour, and time saved.

The score is a demo aid rather than a production routing claim. The UI labels it **route match**, not an exact navigation estimate.

### Results Panel

Renders ranked ride cards, filters, empty states, and the selected ride detail. It synchronizes selection with the map and keeps the core ride information accessible even when the tile layer is unavailable.

## Data Model

Each ride contains:

- Unique ID and display color.
- Driver name, initials, verification state, and rating.
- Departure timestamp, price, and open seats.
- Origin and destination labels and coordinates.
- Ordered route coordinates.
- Supported meetup-point IDs.
- Demo walking, detour, and time-saved metrics per meetup point.

Each meetup point contains an ID, label, coordinates, and a safety-oriented category such as transit stop, public venue, or designated pickup area.

## State and Data Flow

A single application-state object stores mode, trip endpoints, departure time, filters, matches, selected ride, and selected meetup point. User interactions update state, then small render functions update the form, map layers, result cards, and detail panel from that state.

The implementation will avoid a framework migration. The current site is plain HTML, CSS, and JavaScript, and keeping that stack minimizes setup risk. New JavaScript responsibilities will be split into focused files rather than expanding the existing `app.js` into one large controller.

## Error and Empty States

- If the map library or tiles cannot load, show a styled fallback panel and keep the form and ride results functional.
- If geolocation is unavailable or denied, use the chosen demo location without blocking the flow.
- If the trip is incomplete, identify the missing endpoint beside the controls and do not attempt matching.
- If filters remove every ride, explain which filters are active and provide a one-click reset.
- If no route is compatible, show the closest scheduled rides without claiming they are matches.
- Invalid or incomplete ride records are skipped rather than breaking the entire results list.

## Accessibility

- All map actions have equivalent form or button controls.
- Ride cards are real buttons or contain explicit selection buttons.
- Map and card selections expose their state with text and ARIA attributes.
- Focus indicators, sufficient contrast, and minimum touch-target sizes are maintained.
- Status changes use the existing live-region toast or a dedicated status region.
- Route identity never depends on color alone.

## Verification

### Automated checks

- Test match filtering for seat availability and departure windows.
- Test deterministic match ordering.
- Test selection of an eligible meetup point.
- Test incomplete and invalid ride data handling.

### Manual demo checks

- Complete the primary flow on desktop and a narrow mobile viewport.
- Place and replace both map pins.
- Select rides from both cards and map markers and confirm synchronized highlighting.
- Exercise both filter controls and the empty-state reset.
- Deny geolocation and confirm the demo still works.
- Simulate tile failure and confirm the planner and results remain readable.
- Enable reduced motion and navigate all non-map controls by keyboard.

## Delivery Order

1. Establish the map layout, dataset, and deterministic demo route.
2. Add endpoint selection and route rendering.
3. Add matching, ride cards, synchronized selection, and meetup details.
4. Add filters, error states, responsive behavior, accessibility, and polish.
5. Deploy early, rehearse the primary flow, and reserve final time for Devpost materials.

## Demo Narrative

The presenter explains that ordinary rideshare searches require exact pickup and destination matches. They choose a planned trip and CampusCarpool immediately reveals several journeys that partially overlap. Selecting the strongest match displays a safe shared meetup point and quantifies the benefit to both people. The closing message is: **CampusCarpool turns nearby individual trips into one shared route, giving students coordination time back wherever they live or travel.**
