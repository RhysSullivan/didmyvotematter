// The page arrives with every race already drawn (see vite.config.ts). This
// script adds the interactions, and loads the data only to redraw the list
// when the filters change.

import type { Dataset, Race } from "./race";
import { type Filters, LEVELS, applyFilters, countyOptions, details, renderList } from "./render";

let dataset: Promise<Dataset & { readonly byId: ReadonlyMap<string, Race> }> | null = null;
const loadDataset = () =>
  (dataset ??= fetch("/races.json").then(async (response) => {
    if (!response.ok) throw new Error(`races.json: ${response.status}`);
    const data: Dataset = await response.json();
    return { ...data, byId: new Map(data.races.map((race) => [race.id, race])) };
  }));

const byId = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const readFilters = (form: HTMLFormElement): Filters => {
  const data = new FormData(form);
  const level = LEVELS.find((l) => l.value === data.get("level"))?.value ?? "all";
  return { level, state: String(data.get("state") ?? ""), county: String(data.get("county") ?? "") };
};

// Details are drawn the first time a row opens.
const setOpen = async (row: Element, open: boolean) => {
  const panel = row.querySelector("[data-details]");
  if (panel === null) return;
  if (open && panel.childElementCount === 0) {
    const race = (await loadDataset()).byId.get(row.id);
    if (race === undefined) throw new Error(`no data for race ${row.id}`);
    panel.innerHTML = details(race);
  }
  panel.toggleAttribute("hidden", !open);
  row.querySelector("button[aria-expanded]")?.setAttribute("aria-expanded", String(open));
};

const form = byId("filters").querySelector("form")!;
const stateSelect = form.querySelector<HTMLSelectElement>("select[name=state]")!;
const countySelect = form.querySelector<HTMLSelectElement>("select[name=county]")!;
const list = byId("races");

// Bands the reader has collapsed stay collapsed when the filters change.
const collapsed = new Set<number>();

const fillCounties = async (selected: string) => {
  const { counties } = await loadDataset();
  countySelect.innerHTML = countyOptions(counties, stateSelect.value, selected);
  countySelect.disabled = !counties.some((county) => county.state === stateSelect.value);
};

const draw = async () => {
  const { races } = await loadDataset();
  const filters = readFilters(form);
  list.innerHTML = renderList(applyFilters(races, filters), collapsed);
  const next = new URLSearchParams();
  if (filters.level !== "all") next.set("level", filters.level);
  if (filters.state !== "") next.set("state", filters.state);
  if (filters.county !== "") next.set("county", filters.county);
  const query = next.toString();
  history.replaceState(null, "", query === "" ? location.pathname + location.hash : `?${query}${location.hash}`);
  document.documentElement.removeAttribute("data-filtered");
};

const openFromHash = async () => {
  if (location.hash === "") return;
  const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if (target?.matches("[data-race]")) await setOpen(target, true);
  target?.scrollIntoView();
};

// toggle doesn't bubble, so listen in the capture phase.
list.addEventListener(
  "toggle",
  (event) => {
    const band = event.target instanceof HTMLDetailsElement ? event.target.dataset.band : undefined;
    if (band === undefined) return;
    if ((event.target as HTMLDetailsElement).open) collapsed.delete(Number(band));
    else collapsed.add(Number(band));
  },
  true,
);

list.addEventListener("click", (event) => {
  const target = event.target as Element;
  const row = target.closest("[data-race]");
  // Clicks inside open details, or that end a text selection, don't toggle.
  if (row === null || target.closest("[data-details]") !== null || getSelection()?.toString() !== "") return;
  void setOpen(row, row.querySelector("[data-details]")?.hasAttribute("hidden") ?? false);
});

form.addEventListener("change", async (event) => {
  // A new state needs its own county list before the list is redrawn.
  if (event.target === stateSelect) await fillCounties("");
  await draw();
});
form.addEventListener("submit", (event) => event.preventDefault());

const params = new URLSearchParams(location.search);
if (params.has("level") || params.has("state") || params.has("county")) {
  // A filtered link: the prerendered list is hidden (see index.html) until
  // it's redrawn for these filters.
  const level = form.querySelector<HTMLInputElement>(`input[name=level][value="${params.get("level") ?? "all"}"]`);
  if (level !== null) level.checked = true;
  stateSelect.value = params.get("state") ?? "";
  await fillCounties(params.get("county") ?? "");
  await draw();
  await openFromHash();
} else {
  void openFromHash();
  // Fetch the data in the background so the first filter change is instant.
  const idle = window.requestIdleCallback ?? ((callback: () => void) => setTimeout(callback, 1));
  idle(() => void loadDataset());
}
