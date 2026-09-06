const choices = document.querySelectorAll(".trip-choice");
const form = document.querySelector("#ride-form");
const title = document.querySelector("#form-heading");
const submit = document.querySelector("#submit-label");
const note = document.querySelector("#form-note");
const toast = document.querySelector(".toast");
let mode = "request";

choices.forEach((choice) =>
  choice.addEventListener("click", () => {
    choices.forEach((c) => c.classList.remove("active"));
    choice.classList.add("active");
    mode = choice.dataset.mode;
    const offering = mode === "offer";
    title.textContent = offering ? "Share your ride" : "Find your next ride";
    submit.textContent = offering ? "Post a ride" : "Search rides";
    note.textContent = offering
      ? "Add your route and available seats — classmates can request to join."
      : "Looking for a longer trip? Search by city, airport, or address.";
  }),
);

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const destination = document.querySelector("#to").value || "your destination";
  toast.textContent =
    mode === "offer"
      ? `Your ride to ${destination} is ready to post.`
      : `Showing rides to ${destination}.`;
  toast.classList.add("show");
  setTimeout(() => toast.classList.remove("show"), 3200);
});
