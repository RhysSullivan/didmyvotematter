import type { Candidate, Category, Dataset, Race } from "./race";

const OFFICES: readonly { readonly value: Category | "all"; readonly label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "congress", label: "Congress" },
  { value: "statewide", label: "Statewide" },
  { value: "legislature", label: "Legislature" },
  { value: "local", label: "Local" },
  { value: "measure", label: "Ballot measures" },
];

// Each race falls in the first band whose limit its margin doesn't exceed.
const BANDS: readonly { readonly limit: number; readonly title: string }[] = [
  { limit: 0, title: "Tied" },
  { limit: 1, title: "One person" },
  { limit: 5, title: "Could fit in a car" },
  { limit: 12, title: "Could fit in a jury box" },
  { limit: 30, title: "Could fit in a classroom" },
  { limit: 72, title: "Could fit on a school bus" },
  { limit: 416, title: "Could fit on a 747" },
  { limit: 2_500, title: "Could fit in a big high school" },
  { limit: 19_000, title: "Could fit in an NBA arena" },
  { limit: 100_000, title: "Could fit in a football stadium" },
  { limit: Number.POSITIVE_INFINITY, title: "Wouldn’t fit in a football stadium" },
];

// Races with less of the vote counted than this are hidden unless "Early
// counts" is on: a margin that early says little about the final result.
const EARLY_BELOW = 95;
const MAX_DOTS = 1_000;
const DOTS_PER_ROW = 30;

const number = new Intl.NumberFormat("en-US");
const fmt = (n: number) => number.format(n);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const bandIndex = (margin: number) => BANDS.findIndex((band) => margin <= band.limit);

const isEarly = (race: Race) => race.status === "counting" && race.counted < EARLY_BELOW;

const partyColor = (party: string | null) =>
  party === "D" ? "text-blue-600 dark:text-blue-400" : party === "R" ? "text-red-600 dark:text-red-400" : "text-neutral-950 dark:text-white";

const candidateLabel = (c: Candidate) => (c.party === null ? c.name : `${c.name} (${c.party})`);

const flipSentence = (race: Race, ahead: Candidate, behind: Candidate) => {
  const settled = race.status !== "counting";
  if (race.threshold !== null) {
    return `${fmt(race.margin)} ${plural(race.margin, "vote", "votes")} from the ${race.threshold}% it needed to pass.`;
  }
  if (race.margin === 0) return race.seats > 1 ? "Tied for the last seat." : "Tied.";
  const switchers = Math.floor(race.margin / 2) + 1;
  const people = `${fmt(switchers)} ${plural(switchers, "person", "people")}`;
  return `${people} switching from ${escape(ahead.name)} to ${escape(behind.name)} ${settled ? "would have flipped it" : "would flip it"}.`;
};

const statusLabel = (race: Race) => {
  if (race.status === "certified") return "Certified";
  if (race.status === "called") return `Called · ${Math.round(race.counted)}% counted`;
  return `Still counting · ${Math.round(race.counted)}% counted`;
};

const pile = (race: Race, ahead: Candidate) => {
  if (race.margin === 0 || race.margin > MAX_DOTS) return "";
  const rows = Math.floor(race.margin / DOTS_PER_ROW);
  const rem = race.margin % DOTS_PER_ROW;
  return `<div class="pile ${partyColor(ahead.party)}" aria-hidden="true">
    ${rows > 0 ? `<div data-full style="--rows: ${rows}"></div>` : ""}
    ${rem > 0 ? `<div data-rem style="--rem: ${rem}"></div>` : ""}
  </div>`;
};

const raceRow = (race: Race) => {
  const ahead = race.candidates[race.seats - 1]!;
  const behind = race.candidates[race.seats]!;
  const where = [race.stateName, race.office, race.seat].filter((part) => part !== null);
  const notes = [
    race.seats > 1 ? `Elects ${race.seats}. The race for the last seat` : null,
    race.rankedChoice ? "Ranked-choice. First-choice votes" : null,
  ].filter((note) => note !== null);

  return `<article id="${escape(race.id)}" class="race-row grid gap-x-8 gap-y-4 border-t border-neutral-950/5 py-8 first:border-t-0 sm:grid-cols-[7rem_1fr] dark:border-white/10">
    <div class="flex items-baseline gap-x-2 sm:flex-col sm:gap-y-1">
      <p class="text-5xl font-semibold tracking-tight tabular-nums">${fmt(race.margin)}</p>
      <p class="text-base/6 text-neutral-500 sm:text-sm/6">${plural(race.margin, "vote", "votes")}</p>
    </div>
    <div class="flex min-w-0 flex-col gap-y-3">
      <p class="text-base/6 text-neutral-500 sm:text-sm/6">${where.map(escape).join(" · ")}</p>
      ${notes.length > 0 ? `<p class="text-base/6 text-neutral-500 sm:text-sm/6">${notes.join(". ")}.</p>` : ""}
      <dl class="grid grid-cols-[1fr_auto] gap-x-6 gap-y-1 text-lg/7 tabular-nums sm:text-base/7">
        <dt class="truncate font-medium">${escape(candidateLabel(ahead))}</dt><dd class="text-right font-medium">${fmt(ahead.votes)}</dd>
        <dt class="truncate text-neutral-600 dark:text-neutral-400">${escape(candidateLabel(behind))}</dt><dd class="text-right text-neutral-600 dark:text-neutral-400">${fmt(behind.votes)}</dd>
      </dl>
      ${pile(race, ahead)}
      <p class="text-base/7 text-pretty sm:text-sm/6">${flipSentence(race, ahead, behind)}</p>
      <p class="text-base/6 text-neutral-500 tabular-nums sm:text-sm/6">${fmt(race.totalVotes)} votes cast · ${statusLabel(race)}</p>
    </div>
  </article>`;
};

const bandHeading = (index: number, races: readonly Race[]) => {
  const band = BANDS[index]!;
  const floor = index === 0 ? 0 : BANDS[index - 1]!.limit + 1;
  const range =
    band.limit === 0 ? "0 votes" : band.limit === floor ? `${fmt(floor)} vote` : band.limit === Number.POSITIVE_INFINITY ? `${fmt(floor)}+ votes` : `${fmt(floor)}–${fmt(band.limit)} votes`;
  return `<section class="pt-16 first:pt-10">
    <div class="flex items-baseline justify-between gap-x-6 border-b border-neutral-950/10 pb-3 dark:border-white/15">
      <h2 class="text-2xl font-semibold tracking-tight text-balance">${band.title}</h2>
      <p class="shrink-0 text-base/6 text-neutral-500 tabular-nums sm:text-sm/6">${range} · ${fmt(races.length)} ${plural(races.length, "race", "races")}</p>
    </div>
    ${races.map(raceRow).join("")}
  </section>`;
};

interface Filters {
  readonly office: Category | "all";
  readonly state: string;
  readonly early: boolean;
}

const readFilters = (form: HTMLFormElement): Filters => {
  const data = new FormData(form);
  const office = OFFICES.find((o) => o.value === data.get("office"))?.value ?? "all";
  return { office, state: String(data.get("state") ?? ""), early: data.get("early") === "on" };
};

const applyFilters = (races: readonly Race[], filters: Filters) =>
  races.filter(
    (race) =>
      (filters.office === "all" || race.category === filters.office) &&
      (filters.state === "" || race.state === filters.state) &&
      (filters.early || !isEarly(race)),
  );

const renderStats = (el: HTMLElement, races: readonly Race[]) => {
  const stat = (limit: number) => {
    const count = races.filter((race) => race.margin <= limit).length;
    return `<div><dt class="text-base/6 text-neutral-500 sm:text-sm/6">Within ${fmt(limit)} ${plural(limit, "vote", "votes")}</dt>
      <dd class="mt-1 text-3xl font-semibold tracking-tight tabular-nums">${fmt(count)}</dd></div>`;
  };
  el.innerHTML = stat(10) + stat(100) + stat(1_000);
};

const renderRaces = (el: HTMLElement, races: readonly Race[]) => {
  if (races.length === 0) {
    el.innerHTML = `<p class="pt-16 text-lg/8 text-neutral-500">No races match.</p>`;
    return;
  }
  const groups = new Map<number, Race[]>();
  for (const race of races) {
    const index = bandIndex(race.margin);
    const group = groups.get(index);
    if (group === undefined) groups.set(index, [race]);
    else group.push(race);
  }
  el.innerHTML = [...groups].map(([index, group]) => bandHeading(index, group)).join("");
};

const renderSource = (el: HTMLElement, dataset: Dataset) => {
  const updated = new Date(dataset.resultsUpdatedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  });
  el.textContent = `Unofficial results from the Associated Press, via The New York Times, last updated ${updated}. Votes are still being counted, so margins will move until each state certifies, between November 10 and December 18. Races with one candidate, or with less than ${EARLY_BELOW}% of the vote counted, are left out unless you ask for early counts.`;
};

const officeOptions = (fieldset: HTMLFieldSetElement, selected: string) => {
  fieldset.innerHTML = OFFICES.map(
    (office) => `<label class="shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-base/6 text-neutral-600 hover:text-neutral-950 has-checked:bg-neutral-950 has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 sm:py-1 sm:text-sm/6 dark:text-neutral-400 dark:hover:text-white dark:has-checked:bg-white dark:has-checked:text-neutral-950">
      <input type="radio" name="office" value="${office.value}" class="sr-only" ${office.value === selected ? "checked" : ""} />${office.label}</label>`,
  ).join("");
};

const stateOptions = (select: HTMLSelectElement, races: readonly Race[], selected: string) => {
  const states = new Map(races.map((race) => [race.state, race.stateName]));
  const sorted = [...states].sort((a, b) => a[1].localeCompare(b[1]));
  select.innerHTML =
    `<option value="">All states</option>` +
    sorted.map(([code, name]) => `<option value="${code}" ${code === selected ? "selected" : ""}>${escape(name)}</option>`).join("");
};

const byId = <T extends HTMLElement>(id: string) => {
  const el = document.getElementById(id);
  if (el === null) throw new Error(`missing #${id}`);
  return el as T;
};

const main = async () => {
  const response = await fetch("/races.json");
  const dataset: Dataset = await response.json();

  const form = byId("filters").querySelector("form")!;
  const params = new URLSearchParams(location.search);
  officeOptions(form.querySelector("fieldset")!, params.get("office") ?? "all");
  stateOptions(form.querySelector("select")!, dataset.races, params.get("state") ?? "");
  form.querySelector<HTMLInputElement>("input[name=early]")!.checked = params.get("early") === "1";

  const stats = byId("stats");
  const list = byId("races");
  renderSource(byId("source"), dataset);

  const update = () => {
    const filters = readFilters(form);
    const shown = applyFilters(dataset.races, filters);
    renderStats(stats, shown);
    renderRaces(list, shown);
    const next = new URLSearchParams();
    if (filters.office !== "all") next.set("office", filters.office);
    if (filters.state !== "") next.set("state", filters.state);
    if (filters.early) next.set("early", "1");
    const query = next.toString();
    history.replaceState(null, "", query === "" ? location.pathname + location.hash : `?${query}${location.hash}`);
  };

  form.addEventListener("change", update);
  form.addEventListener("submit", (event) => event.preventDefault());
  update();
  if (location.hash !== "") document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView();
};

void main();
