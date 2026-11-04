import type { Candidate, County, Dataset, Level, Race } from "./race";

// Zoom levels: Congress, then the state, then counties, cities and districts.
const LEVELS: readonly { readonly value: Level | "all"; readonly label: string }[] = [
  { value: "all", label: "Everything" },
  { value: "federal", label: "Federal" },
  { value: "state", label: "State" },
  { value: "local", label: "Local" },
];

// Each race falls in the first band whose limit its margin doesn't exceed.
const BANDS: readonly { readonly limit: number; readonly title: string }[] = [
  { limit: 0, title: "A tie" },
  { limit: 1, title: "One person" },
  { limit: 5, title: "Could fit in a car" },
  { limit: 12, title: "Could fit in a jury box" },
  { limit: 30, title: "Could fit in a classroom" },
  { limit: 72, title: "Could fit on a school bus" },
  { limit: 416, title: "Could fit on a 747" },
  { limit: 2_500, title: "Could fit in a high school" },
  { limit: 19_000, title: "Could fit in an arena" },
  { limit: 100_000, title: "Could fit in a stadium" },
  { limit: Number.POSITIVE_INFINITY, title: "Not close" },
];

// Below this share of the expected vote, a race is tagged as an early count.
const EARLY_BELOW = 95;
const MAX_DOTS = 1_000;
const DOTS_PER_ROW = 30;

const SHORT_OFFICE: Readonly<Record<string, string>> = {
  "State House": "House",
  "State Senate": "Senate",
  "State Assembly": "Assembly",
  "State Legislature": "Legislature",
};

const number = new Intl.NumberFormat("en-US");
const fmt = (n: number) => number.format(n);
const thousands = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 0 });
const millions = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 });
// The margin column fits four digits; past that, "258K" says enough and the
// exact figure is in the details.
const COMPACT_FROM = 10_000;
const fmtMargin = (n: number) =>
  n < COMPACT_FROM ? fmt(n) : n < 999_500 ? thousands.format(n) : millions.format(n);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const escape = (text: string) => text.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

const ordinal = (n: number) => {
  const tens = n % 100;
  const suffix = tens >= 11 && tens <= 13 ? "th" : ({ 1: "st", 2: "nd", 3: "rd" } as Record<number, string>)[n % 10] ?? "th";
  return `${n}${suffix}`;
};

const bandIndex = (margin: number) => BANDS.findIndex((band) => margin <= band.limit);

const partyText = (party: string | null) =>
  party === "D" ? "text-blue-600 dark:text-blue-400" : party === "R" ? "text-red-600 dark:text-red-400" : "text-neutral-950 dark:text-white";

const partyDot = (party: string | null) =>
  party === "D" ? "bg-blue-600 dark:bg-blue-400" : party === "R" ? "bg-red-600 dark:bg-red-400" : "bg-neutral-300 dark:bg-neutral-600";

// "Rockingham District 13" reads as "Rockingham 13"; "District 4" stays.
const shortSeat = (seat: string) => seat.replace(/^(.+\S) District (\S+)$/, "$1 $2");

// A measure's title is "Amendment 81 – Voter ID"; split it into its label and name.
const measureParts = (race: Race) => {
  const title = race.seat ?? race.office;
  const [label, ...rest] = title.split(" – ");
  return rest.length > 0 ? { label: label!, name: rest.join(" – ") } : { label: race.office, name: title };
};

const place = (race: Race) => {
  switch (race.category) {
    case "measure":
      return `${race.stateName} ${measureParts(race).label}`;
    case "congress":
      if (race.office === "U.S. Senate") return `${race.stateName} Senate`;
      return [`${race.stateName} ${race.seat?.replace("District ", "") ?? ""}`.trim(), race.description].filter(Boolean).join(" · ");
    case "legislature":
      return `${race.stateName} ${SHORT_OFFICE[race.office] ?? race.office}, ${shortSeat(race.seat ?? "")}`;
    case "statewide":
      return [`${race.stateName} ${race.office}`, race.seat].filter(Boolean).join(", ");
    case "local":
      return [race.seat, race.office].filter(Boolean).join(" · ");
  }
};

const headline = (race: Race, ahead: Candidate, behind: Candidate) => {
  if (race.category === "measure") {
    const settled = race.status !== "counting";
    const passing = ahead.name === "Yes";
    const verdict = settled ? (passing ? "Passed" : "Failed") : passing ? "Passing" : "Failing";
    return `${escape(measureParts(race).name)} <span class="text-neutral-400 dark:text-neutral-500">${verdict}</span>`;
  }
  // Two candidates sharing a last name are told apart by their full names.
  const label = (c: Candidate) => (ahead.lastName === behind.lastName ? c.name : c.lastName);
  const verb = race.margin === 0 ? "ties" : race.status === "counting" ? "leads" : "over";
  const name = (c: Candidate) =>
    `<span class="inline-flex items-baseline gap-x-1.5"><span class="size-2 shrink-0 self-center rounded-full ${partyDot(c.party)}"></span>${escape(label(c))}</span>`;
  return `${name(ahead)} <span class="text-neutral-400 dark:text-neutral-500">${verb}</span> ${name(behind)}`;
};

const tags = (race: Race) =>
  [
    // A 0% estimate on a race with votes means the AP has no estimate for it.
    race.status === "counting" && race.counted > 0 && race.counted < EARLY_BELOW ? `${Math.round(race.counted)}% counted` : null,
    race.rankedChoice ? "ranked choice" : null,
    race.threshold !== null ? `needs ${race.threshold}%` : null,
  ].filter((tag) => tag !== null);

const pile = (race: Race, ahead: Candidate) => {
  if (race.margin === 0 || race.margin > MAX_DOTS) return "";
  const rows = Math.floor(race.margin / DOTS_PER_ROW);
  const rem = race.margin % DOTS_PER_ROW;
  return `<div class="pile ${partyText(race.category === "measure" ? null : ahead.party)}" aria-hidden="true">
    ${rows > 0 ? `<div data-full style="--rows: ${rows}"></div>` : ""}
    ${rem > 0 ? `<div data-rem style="--rem: ${rem}"></div>` : ""}
  </div>`;
};

const statusLine = (race: Race) => {
  const status =
    race.status === "certified" ? "Certified" : race.status === "called" ? "Called by the AP" : "Not yet called";
  const counted = race.counted > 0 ? `${Math.round(race.counted)}% counted` : null;
  const margin = race.margin >= COMPACT_FROM ? `Margin of ${fmt(race.margin)}` : null;
  return [margin, `${fmt(race.totalVotes)} votes cast`, counted, status].filter((part) => part !== null).join(" · ");
};

const details = (race: Race) => {
  const description = race.category === "measure" && race.description !== null ? race.description : null;
  const thresholdNote =
    race.threshold !== null ? `It needs ${race.threshold}% to pass, so the number is its distance from that line.` : null;
  const seatsNote =
    race.seats > 1
      ? `This district elects ${race.seats} people, so the top ${race.seats} finishers win. The number is the gap between ${ordinal(race.seats)} place, who gets the last seat, and ${ordinal(race.seats + 1)} place, who misses out.`
      : null;
  const rcvNote = race.rankedChoice ? "Ranked-choice race. These are first-choice votes." : null;
  const notes = [description, thresholdNote, seatsNote, rcvNote].filter((note) => note !== null);
  return `<div class="flex flex-col gap-y-4 pb-8 sm:pl-[calc(7rem+--spacing(6))]">
    ${notes.map((note) => `<p class="max-w-[60ch] text-base/7 text-pretty sm:text-sm/6">${escape(note)}</p>`).join("")}
    <table class="w-full max-w-md text-base/7 tabular-nums sm:text-sm/6">
      <tbody>
        ${race.candidates
          .map(
            (c, i) => `<tr class="${i === race.seats - 1 || i === race.seats ? "" : "text-neutral-500"} ${race.seats > 1 && i === race.seats - 1 ? "border-b border-neutral-950/15 dark:border-white/20" : ""}">
              ${race.seats > 1 ? `<td class="w-8 py-0.5 text-neutral-500">${i + 1}</td>` : ""}
              <td class="py-0.5 pr-4"><span class="inline-flex items-baseline gap-x-2"><span class="size-2 shrink-0 self-center rounded-full ${partyDot(c.party)}"></span>${escape(c.name)}${c.party !== null ? ` <span class="text-neutral-500">${escape(c.party)}</span>` : ""}</span></td>
              <td class="py-0.5 text-right">${fmt(c.votes)}</td>
            </tr>`,
          )
          .join("")}
      </tbody>
    </table>
    <p class="text-base/6 text-neutral-500 tabular-nums sm:text-sm/6">${statusLine(race)}</p>
  </div>`;
};

// State silhouettes from ProPublica's StateFace, in public/states.svg.
const stateIcon = (state: string) =>
  `<svg class="size-9 shrink-0 fill-current text-neutral-800 max-sm:hidden dark:text-neutral-200" aria-hidden="true"><use href="/states.svg#${state}"></use></svg>`;

const raceRow = (race: Race) => {
  const ahead = race.candidates[race.seats - 1]!;
  const behind = race.candidates[race.seats]!;
  const extra = tags(race);
  return `<details id="${escape(race.id)}" class="race-row group border-t border-neutral-950/5 first:border-t-0 dark:border-white/10">
    <summary class="grid cursor-pointer list-none grid-cols-[5.5rem_1fr] gap-x-4 gap-y-3 py-4 sm:grid-cols-[7rem_1fr_auto] sm:gap-x-6 [&::-webkit-details-marker]:hidden">
      <p class="text-3xl font-semibold tracking-tight whitespace-nowrap tabular-nums sm:text-4xl">${fmtMargin(race.margin)}</p>
      <div class="flex min-w-0 items-center gap-x-4 self-start pt-0.5">
        ${stateIcon(race.state)}
        <div class="min-w-0">
          <p class="text-lg/7 font-medium sm:text-base/6">${headline(race, ahead, behind)}</p>
          <p class="mt-0.5 text-base/6 text-neutral-500 sm:text-sm/6">${escape(place(race))}${extra.length > 0 ? ` <span class="text-neutral-400 dark:text-neutral-500">· ${extra.join(" · ")}</span>` : ""}</p>
        </div>
      </div>
      <div class="col-span-full sm:col-span-1 sm:col-start-3 sm:row-start-1 sm:pt-2">${pile(race, ahead)}</div>
    </summary>
    ${details(race)}
  </details>`;
};

const bandHeading = (index: number, races: readonly Race[]) => {
  const band = BANDS[index]!;
  const floor = index === 0 ? 0 : BANDS[index - 1]!.limit + 1;
  const range =
    band.limit === 0
      ? "0 votes"
      : band.limit === floor
        ? `${fmt(floor)} vote`
        : band.limit === Number.POSITIVE_INFINITY
          ? `${fmt(floor)}+ votes`
          : `${fmt(floor)} to ${fmt(band.limit)} votes`;
  return `<details data-band="${index}" class="group/band pt-20 first:pt-12 not-open:pt-6" ${collapsed.has(index) ? "" : "open"}>
    <summary class="flex cursor-pointer list-none flex-wrap items-baseline justify-between gap-x-6 gap-y-1 pb-4 [&::-webkit-details-marker]:hidden">
      <h2 class="flex items-baseline gap-x-3 font-display text-5xl tracking-tight text-balance">
        ${band.title}
        <svg viewBox="0 0 12 8" fill="none" class="size-4 shrink-0 self-center text-neutral-400 group-not-open/band:-rotate-90 dark:text-neutral-500" aria-hidden="true">
          <path d="M1 1.5 6 6.5 11 1.5" stroke="currentcolor" stroke-width="1.5" />
        </svg>
      </h2>
      <p class="text-base/6 text-neutral-500 tabular-nums sm:text-sm/6">${range} · ${fmt(races.length)} ${plural(races.length, "race", "races")}</p>
    </summary>
    <div class="border-t border-neutral-950 dark:border-white">${races.map(raceRow).join("")}</div>
  </details>`;
};

// Bands the reader has collapsed stay collapsed when the filters change.
const collapsed = new Set<number>();

interface Filters {
  readonly level: Level | "all";
  readonly state: string;
  readonly county: string;
}

const readFilters = (form: HTMLFormElement): Filters => {
  const data = new FormData(form);
  const level = LEVELS.find((l) => l.value === data.get("level"))?.value ?? "all";
  return { level, state: String(data.get("state") ?? ""), county: String(data.get("county") ?? "") };
};

// With a county chosen, the list is that county's ballot: its statewide races
// plus every district and local race its voters had.
const applyFilters = (races: readonly Race[], filters: Filters) =>
  races.filter(
    (race) =>
      (filters.level === "all" || race.level === filters.level) &&
      (filters.state === "" || race.state === filters.state) &&
      (filters.county === "" || race.counties === "statewide" || race.counties.includes(filters.county)),
  );

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
  el.textContent = `Unofficial results from the Associated Press via The New York Times, updated ${updated}. Margins will move until states certify, November 10 to December 18. Uncontested races are left out.`;
};

const levelOptions = (fieldset: HTMLFieldSetElement, selected: string) => {
  fieldset.innerHTML = LEVELS.map(
    (level) => `<label class="shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-base/6 text-neutral-600 hover:text-neutral-950 has-checked:bg-neutral-950 has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 sm:py-1 sm:text-sm/6 dark:text-neutral-400 dark:hover:text-white dark:has-checked:bg-white dark:has-checked:text-neutral-950">
      <input type="radio" name="level" value="${level.value}" class="sr-only" ${level.value === selected ? "checked" : ""} />${level.label}</label>`,
  ).join("");
};

const countyOptions = (select: HTMLSelectElement, counties: readonly County[], state: string, selected: string) => {
  const inState = counties.filter((county) => county.state === state).sort((a, b) => a.name.localeCompare(b.name));
  select.disabled = inState.length === 0;
  select.innerHTML =
    `<option value="">All counties</option>` +
    inState.map((county) => `<option value="${county.fips}" ${county.fips === selected ? "selected" : ""}>${escape(county.name.replace(/ County$/, ""))}</option>`).join("");
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
  const stateSelect = form.querySelector<HTMLSelectElement>("select[name=state]")!;
  const countySelect = form.querySelector<HTMLSelectElement>("select[name=county]")!;
  levelOptions(form.querySelector("fieldset")!, params.get("level") ?? "all");
  stateOptions(stateSelect, dataset.races, params.get("state") ?? "");
  countyOptions(countySelect, dataset.counties, stateSelect.value, params.get("county") ?? "");
  stateSelect.addEventListener("change", () => countyOptions(countySelect, dataset.counties, stateSelect.value, ""));

  const list = byId("races");
  renderSource(byId("source"), dataset);

  const update = () => {
    const filters = readFilters(form);
    renderRaces(list, applyFilters(dataset.races, filters));
    const next = new URLSearchParams();
    if (filters.level !== "all") next.set("level", filters.level);
    if (filters.state !== "") next.set("state", filters.state);
    if (filters.county !== "") next.set("county", filters.county);
    const query = next.toString();
    history.replaceState(null, "", query === "" ? location.pathname + location.hash : `?${query}${location.hash}`);
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
  form.addEventListener("change", update);
  form.addEventListener("submit", (event) => event.preventDefault());
  update();
  if (location.hash !== "") {
    const target = document.getElementById(decodeURIComponent(location.hash.slice(1)));
    if (target instanceof HTMLDetailsElement) target.open = true;
    target?.scrollIntoView();
  }
};

void main();
