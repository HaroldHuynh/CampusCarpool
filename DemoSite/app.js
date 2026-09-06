const SUPABASE_URL = "https://jmqcytijuewpwuyuuvui.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_PxgrDYvKti_ortsfOwq5YA_b0tzjP5N";
const supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const rows = document.querySelector("#request-rows");
const tableState = document.querySelector("#table-state");
const count = document.querySelector("#request-count");
const search = document.querySelector("#search");
const modal = document.querySelector("#request-modal");
const form = document.querySelector("#request-form");
const formError = document.querySelector("#form-error");
const submitButton = document.querySelector("#submit-request");
const toast = document.querySelector(".toast");
let requests = [];
function currentProfileId(){let id=localStorage.getItem("campuscarpool_profile_id");if(!id){id=crypto.randomUUID();localStorage.setItem("campuscarpool_profile_id",id)}return id}
async function saveProfile(name){const id=currentProfileId();const{error}=await supabaseClient.from("campus_profiles").upsert({id,display_name:name},{onConflict:"id"});if(error)throw error;localStorage.setItem("campuscarpool_profile_name",name);return id}
function rating(profile){return profile&&profile.rating_count?`<span class="user-rating">★ ${Number(profile.rating_average).toFixed(1)} <small>(${profile.rating_count})</small></span>`:'<span class="user-rating unrated">☆ New</span>'}

function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function initials(name) { return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase(); }
function formatDeparture(value) { const date = new Date(value); return { day: new Intl.DateTimeFormat(undefined, { weekday: "short", month: "short", day: "numeric" }).format(date), time: new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" }).format(date) }; }
function showToast(message) { toast.textContent = message; toast.classList.add("show"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => toast.classList.remove("show"), 3000); }
function setState(message, loading = false) { tableState.innerHTML = loading ? '<span class="spinner"></span><p>Loading ride requests…</p>' : `<p>${escapeHtml(message)}</p>`; tableState.classList.add("show"); }

function renderRequests() {
  const term = search.value.trim().toLowerCase();
  const filtered = requests.filter((request) => [request.rider_name, request.origin, request.destination].some((value) => value.toLowerCase().includes(term)));
  rows.innerHTML = filtered.map((request, index) => { const departure = formatDeparture(request.departure_at),own=request.requester_profile_id===localStorage.getItem("campuscarpool_profile_id"); return `<tr><td><div class="rider"><span class="avatar color-${index % 4}">${escapeHtml(initials(request.rider_name))}</span><span>${escapeHtml(request.rider_name)}${rating(request.requester)}</span></span></div></td><td><span class="location">${escapeHtml(request.origin)}</span></td><td><span class="destination"><span class="route-arrow">→</span>${escapeHtml(request.destination)}</span></td><td><strong>${escapeHtml(departure.day)}</strong><span class="date-note">${escapeHtml(departure.time)}</span></td><td><span class="price">$${Number(request.price_offer).toFixed(0)}</span><small class="place-note">offered</small></td><td>${own?`<button class="close-request" data-close-request="${request.id}">Close request</button>`:`<button class="contact" type="button" data-contact="${escapeHtml(request.contact_info)}">Contact rider</button>`}</td></tr>`; }).join("");
  tableState.classList.remove("show");
  if (!filtered.length) setState(term ? "No requests match your search." : "No open requests yet. Be the first to post one!");
  count.textContent = `${filtered.length} open request${filtered.length === 1 ? "" : "s"}`;
}

async function loadRequests() {
  setState("", true);
  const { data, error } = await supabaseClient.from("ride_requests").select("id,rider_name,contact_info,origin,destination,departure_at,price_offer,requester_profile_id,requester:campus_profiles!requester_profile_id(rating_average,rating_count)").eq("is_closed",false).gte("departure_at", new Date().toISOString()).order("departure_at", { ascending: true });
  if (error) { console.error("Could not load requests:", error); setState("Could not load requests. Run supabase.sql in your Supabase project, then refresh."); count.textContent = "Database setup needed"; return; }
  requests = data ?? []; renderRequests();
}

function openModal() {
  form.reset(); formError.classList.remove("show");
  const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  form.elements.departure_date.min = now.toISOString().slice(0, 10); form.elements.departure_date.value = now.toISOString().slice(0, 10);
  modal.showModal(); form.elements.rider_name.focus();
}

document.querySelectorAll("[data-open-modal]").forEach((button) => button.addEventListener("click", openModal));
document.querySelectorAll("[data-close-modal]").forEach((button) => button.addEventListener("click", () => modal.close()));
modal.addEventListener("click", (event) => { if (event.target === modal) modal.close(); });
search.addEventListener("input", renderRequests);
document.querySelector("#refresh").addEventListener("click", loadRequests);
rows.addEventListener("click", async (event) => { const close=event.target.closest("[data-close-request]");if(close){close.disabled=true;const{data,error}=await supabaseClient.rpc("close_ride_request",{request_id:Number(close.dataset.closeRequest),closing_profile_id:currentProfileId()});showToast(error?"Could not close that request.":data?"Ride request closed.":"This request belongs to another profile.");await loadRequests();return}const button = event.target.closest("[data-contact]"); if (!button) return; try { await navigator.clipboard.writeText(button.dataset.contact); showToast("Contact info copied to your clipboard."); } catch { showToast(`Contact: ${button.dataset.contact}`); } });

form.addEventListener("submit", async (event) => {
  event.preventDefault(); formError.classList.remove("show"); const values = new FormData(form);
  const departure = new Date(`${values.get("departure_date")}T${values.get("departure_time")}`);
  if (departure <= new Date()) { formError.textContent = "Please choose a departure time in the future."; formError.classList.add("show"); return; }
  submitButton.disabled = true; submitButton.textContent = "Posting…";
  let error;try{const profile=await saveProfile(values.get("rider_name").trim());({error}=await supabaseClient.from("ride_requests").insert({ rider_name: values.get("rider_name").trim(), contact_info: values.get("contact_info").trim(), origin: values.get("origin").trim(), destination: values.get("destination").trim(), departure_at: departure.toISOString(), price_offer: Number(values.get("price_offer")),requester_profile_id:profile }));}catch(caught){error=caught}
  submitButton.disabled = false; submitButton.innerHTML = 'Post request <span>→</span>';
  if (error) { console.error("Could not post request:", error); formError.textContent = error.message; formError.classList.add("show"); return; }
  modal.close(); showToast("Your ride request is live!"); await loadRequests();
});

loadRequests();
supabaseClient.channel("ride-requests-live").on("postgres_changes", { event: "*", schema: "public", table: "ride_requests" }, loadRequests).subscribe();
