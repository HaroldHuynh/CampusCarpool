const client = window.supabase.createClient("https://jmqcytijuewpwuyuuvui.supabase.co", "sb_publishable_PxgrDYvKti_ortsfOwq5YA_b0tzjP5N");
const rows = document.querySelector("#ride-rows");
const state = document.querySelector("#ride-state");
const count = document.querySelector("#ride-count");
const search = document.querySelector("#ride-search");
let rides = [];

function safe(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function departure(value) { const date = new Date(value); return { date: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }), time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) }; }
function message(text, loading = false) { state.innerHTML = loading ? '<span class="spinner"></span><p>Loading offered rides…</p>' : `<p>${safe(text)}</p>`; state.classList.add("show"); }
function render() {
  const term = search.value.trim().toLowerCase();
  const shown = rides.filter((ride) => [ride.origin, ride.destination].some((value) => value.toLowerCase().includes(term)));
  rows.innerHTML = shown.map((ride) => { const when = departure(ride.departure_at); return `<tr><td><span class="destination">${safe(ride.origin)} <span class="route-arrow">→</span> ${safe(ride.destination)}</span></td><td><strong>${safe(when.date)}</strong><span class="date-note">${safe(when.time)}</span></td><td><strong>${Number(ride.seats_available)} seat${Number(ride.seats_available) === 1 ? "" : "s"}</strong></td><td><span class="price">$${Number(ride.price_per_seat).toFixed(0)}</span><small class="place-note">per seat</small></td></tr>`; }).join("");
  state.classList.remove("show"); if (!shown.length) message(term ? "No rides match your search." : "No rides have been offered yet."); count.textContent = `${shown.length} available ride${shown.length === 1 ? "" : "s"}`;
}
async function load() {
  message("", true); const { data, error } = await client.from("rides").select("id,origin,destination,departure_at,seats_available,price_per_seat").gte("departure_at", new Date().toISOString()).order("departure_at", { ascending: true });
  if (error) { console.error(error); message("Could not load offered rides. Check the Supabase rides table and policies."); count.textContent = "Unable to load rides"; return; }
  rides = data ?? []; render();
}
search.addEventListener("input", render); document.querySelector("#ride-refresh").addEventListener("click", load); load();
client.channel("offered-rides-live").on("postgres_changes", { event: "*", schema: "public", table: "rides" }, load).subscribe();
