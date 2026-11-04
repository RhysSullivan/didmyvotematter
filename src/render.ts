// Turns races into HTML. Used at build time to write the page, and in the
// browser to redraw it when the filters change.
import type { Candidate, County, Dataset, Level, Race } from "./race";

// Zoom levels: Congress, then the state, then counties, cities and districts.
export const LEVELS: readonly { readonly value: Level | "all"; readonly label: string }[] = [
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

// Party colours come from the party-* utilities in style.css: text colour
// for the crowd, background for the small dots.
const partyClass = (party: string | null) => (party === "D" ? "party-d" : party === "R" ? "party-r" : "party-x");

const partyDot = (party: string | null) => `party-dot ${partyClass(party)}`;

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
    return `${escape(measureParts(race).name)} <span class="race-quiet">${verdict}</span>`;
  }
  // Two candidates sharing a last name are told apart by their full names.
  const label = (c: Candidate) => (ahead.lastName === behind.lastName ? c.name : c.lastName);
  const verb = race.margin === 0 ? "ties" : race.status === "counting" ? "leads" : "over";
  const name = (c: Candidate) =>
    `<span class="race-name"><span class="${partyDot(c.party)}"></span>${escape(label(c))}</span>`;
  return `${name(ahead)} <span class="race-quiet">${verb}</span> ${name(behind)}`;
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
  return `<div class="pile ${partyClass(race.category === "measure" ? null : ahead.party)}" aria-hidden="true">${rows > 0 ? `<div data-full style="--rows:${rows}"></div>` : ""}${rem > 0 ? `<div data-rem style="--rem:${rem}"></div>` : ""}</div>`;
};

const statusLine = (race: Race) => {
  const status =
    race.status === "certified" ? "Certified" : race.status === "called" ? "Called by the AP" : "Not yet called";
  const counted = race.counted > 0 ? `${Math.round(race.counted)}% counted` : null;
  const margin = race.margin >= COMPACT_FROM ? `Margin of ${fmt(race.margin)}` : null;
  return [margin, `${fmt(race.totalVotes)} votes cast`, counted, status].filter((part) => part !== null).join(" · ");
};

// Drawn when a row is first opened, not up front.
export const details = (race: Race) => {
  const description = race.category === "measure" && race.description !== null ? race.description : null;
  const thresholdNote =
    race.threshold !== null ? `It needs ${race.threshold}% to pass, so the number is its distance from that line.` : null;
  const seatsNote =
    race.seats > 1
      ? `This district elects ${race.seats} people, so the top ${race.seats} finishers win. The number is the gap between ${ordinal(race.seats)} place, who gets the last seat, and ${ordinal(race.seats + 1)} place, who misses out.`
      : null;
  const rcvNote = race.rankedChoice ? "Ranked-choice race. These are first-choice votes." : null;
  const notes = [description, thresholdNote, seatsNote, rcvNote].filter((note) => note !== null);
  return `<div class="flex flex-col gap-y-4 pt-5 pb-3">
    ${notes.map((note) => `<p class="max-w-[60ch] text-base/7 text-pretty sm:text-sm/6">${escape(note)}</p>`).join("")}
    <table class="w-full max-w-md text-base/7 tabular-nums sm:text-sm/6">
      <tbody>
        ${race.candidates
          .map(
            (c, i) => `<tr class="${i === race.seats - 1 || i === race.seats ? "" : "text-neutral-500"} ${race.seats > 1 && i === race.seats - 1 ? "border-b border-neutral-950/15 dark:border-white/20" : ""}">
              ${race.seats > 1 ? `<td class="w-8 py-0.5 text-neutral-500">${i + 1}</td>` : ""}
              <td class="py-0.5 pr-4"><span class="inline-flex items-baseline gap-x-2"><span class="${partyDot(c.party)}"></span>${escape(c.name)}${c.party !== null ? ` <span class="text-neutral-500">${escape(c.party)}</span>` : ""}</span></td>
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
const stateIcon = (state: string) => `<svg class="race-state" aria-hidden="true"><use href="/states.svg#${state}"></use></svg>`;

// A row opens its details in the names column, beside the crowd. The whole
// row is clickable; the button inside makes it reachable by keyboard. The
// race-* utilities are in style.css: with thousands of rows in the page,
// spelling every class out on each one would double its size.
const raceRow = (race: Race) => {
  const ahead = race.candidates[race.seats - 1]!;
  const behind = race.candidates[race.seats]!;
  const extra = tags(race);
  const id = escape(race.id);
  return `<article id="${id}" data-race class="race"><p class="race-margin">${fmtMargin(race.margin)}</p><div class="race-main">${stateIcon(race.state)}<div class="race-text"><button type="button" aria-expanded="false" aria-controls="${id}-details" class="race-toggle"><span class="race-headline">${headline(race, ahead, behind)}</span><span class="race-place">${escape(place(race))}${extra.length > 0 ? ` <span class="race-quiet">· ${extra.join(" · ")}</span>` : ""}</span></button><div id="${id}-details" data-details hidden class="cursor-auto"></div></div></div><div class="race-pile">${pile(race, ahead)}</div></article>`;
};

const bandHeading = (index: number, races: readonly Race[], collapsed: ReadonlySet<number>) => {
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
  return `<details data-band="${index}" class="group/band pt-6 first:pt-12 open:pb-14" ${collapsed.has(index) ? "" : "open"}>
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

export interface Filters {
  readonly level: Level | "all";
  readonly state: string;
  readonly county: string;
}

// With a county chosen, the list is that county's ballot: its statewide races
// plus every district and local race its voters had.
export const applyFilters = (races: readonly Race[], filters: Filters) =>
  races.filter(
    (race) =>
      (filters.level === "all" || race.level === filters.level) &&
      (filters.state === "" || race.state === filters.state) &&
      (filters.county === "" || race.counties === "statewide" || race.counties.includes(filters.county)),
  );

export const renderList = (races: readonly Race[], collapsed: ReadonlySet<number>) => {
  if (races.length === 0) return `<p class="pt-16 text-lg/8 text-neutral-500">No races match.</p>`;
  const groups = new Map<number, Race[]>();
  for (const race of races) {
    const index = bandIndex(race.margin);
    const group = groups.get(index);
    if (group === undefined) groups.set(index, [race]);
    else group.push(race);
  }
  return [...groups].map(([index, group]) => bandHeading(index, group, collapsed)).join("");
};

// Rendered at build time, so the time zone is fixed rather than the reader's.
export const sourceText = (dataset: Dataset) => {
  const updated = new Date(dataset.resultsUpdatedAt).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: "America/New_York",
    timeZoneName: "short",
  });
  return escape(
    `Unofficial results from the Associated Press via The New York Times, updated ${updated}. Margins will move until states certify, November 10 to December 18. Uncontested races are left out.`,
  );
};

export const levelOptions = (selected: string) =>
  LEVELS.map(
    (level) => `<label class="shrink-0 cursor-pointer rounded-full px-3 py-1.5 text-base/6 text-neutral-600 hover:text-neutral-950 has-checked:bg-neutral-950 has-checked:text-white has-focus-visible:outline-2 has-focus-visible:outline-offset-2 sm:py-1 sm:text-sm/6 dark:text-neutral-400 dark:hover:text-white dark:has-checked:bg-white dark:has-checked:text-neutral-950">
      <input type="radio" name="level" value="${level.value}" class="sr-only" ${level.value === selected ? "checked" : ""} />${level.label}</label>`,
  ).join("");

export const countyOptions = (counties: readonly County[], state: string, selected: string) => {
  const inState = counties.filter((county) => county.state === state).sort((a, b) => a.name.localeCompare(b.name));
  return `<option value="">All counties</option>` +
    inState.map((county) => `<option value="${county.fips}" ${county.fips === selected ? "selected" : ""}>${escape(county.name.replace(/ County$/, ""))}</option>`).join("");
};

export const stateOptions = (races: readonly Race[], selected: string) => {
  const states = new Map(races.map((race) => [race.state, race.stateName]));
  const sorted = [...states].sort((a, b) => a[1].localeCompare(b[1]));
  return `<option value="">All states</option>` +
    sorted.map(([code, name]) => `<option value="${code}" ${code === selected ? "selected" : ""}>${escape(name)}</option>`).join("");
};
