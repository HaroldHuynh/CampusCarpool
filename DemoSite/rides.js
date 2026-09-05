const client = window.supabase.createClient("https://jmqcytijuewpwuyuuvui.supabase.co", "sb_publishable_PxgrDYvKti_ortsfOwq5YA_b0tzjP5N");
const rows = document.querySelector("#ride-rows");
const state = document.querySelector("#ride-state");
const count = document.querySelector("#ride-count");
const search = document.querySelector("#ride-search");
const offerModal = document.querySelector("#offer-modal");
const offerForm = document.querySelector("#offer-form");
const offerError = document.querySelector("#offer-error");
const offerSubmit = document.querySelector("#submit-offer");
const toast = document.querySelector(".toast");
let rides = [];

function safe(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function departure(value) { const date = new Date(value); return { date: date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }), time: date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }) }; }
function message(text, loading = false) { state.innerHTML = loading ? '<span class="spinner"></span><p>Loading offered rides…</p>' : `<p>${safe(text)}</p>`; state.classList.add("show"); }
function showToast(text) { toast.textContent = text; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000); }
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

function openOfferForm() {
  offerForm.reset(); offerForm.elements.seats_available.value = 1; offerError.classList.remove("show");
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  offerForm.elements.departure_date.min = now.toISOString().slice(0, 10); offerForm.elements.departure_date.value = now.toISOString().slice(0, 10);
  offerModal.showModal(); offerForm.elements.origin.focus();
}
document.querySelectorAll("[data-open-offer]").forEach((button) => button.addEventListener("click", openOfferForm));
document.querySelectorAll("[data-close-offer]").forEach((button) => button.addEventListener("click", () => offerModal.close()));
offerModal.addEventListener("click", (event) => { if (event.target === offerModal) offerModal.close(); });
offerForm.addEventListener("submit", async (event) => {
  event.preventDefault(); offerError.classList.remove("show"); const values = new FormData(offerForm);
  const rideDeparture = new Date(`${values.get("departure_date")}T${values.get("departure_time")}`);
  if (rideDeparture <= new Date()) { offerError.textContent = "Please choose a departure time in the future."; offerError.classList.add("show"); return; }
  offerSubmit.disabled = true; offerSubmit.textContent = "Posting…";
  const { error } = await client.from("rides").insert({ origin: values.get("origin").trim(), destination: values.get("destination").trim(), departure_at: rideDeparture.toISOString(), seats_available: Number(values.get("seats_available")), price_per_seat: Number(values.get("price_per_seat")) });
  offerSubmit.disabled = false; offerSubmit.innerHTML = 'Post ride <span>→</span>';
  if (error) { console.error(error); offerError.textContent = error.message; offerError.classList.add("show"); return; }
  offerModal.close(); showToast("Your ride offer is live!"); await load();
});
