// Turns the raw state results in data/raw/<election>/ into public/races.json:
// one entry per contested race that has votes counted, with its margin.

import type { Candidate, Category, Dataset, Race, Status } from "../src/race";
import { ELECTION, STATES, rawDir } from "./states";

// Only the parts of the NYT feed this build reads.
interface FeedVotes { readonly total: number }
interface FeedUnitCandidate { readonly nyt_id: string; readonly votes: FeedVotes }
interface FeedUnit {
  readonly level: string;
  readonly state_postal: string;
  readonly eevp: number | null;
  readonly total_votes: number;
  readonly candidates: readonly FeedUnitCandidate[];
}
interface FeedCandidateMeta {
  readonly first_name: string | null;
  readonly last_name: string;
  readonly party: { readonly nyt_id: string; readonly abbreviation: string | null } | null;
}
interface FeedRace {
  readonly nyt_id: string;
  readonly office: string;
  readonly seat: string | null;
  readonly ballot_measure_text: string | null;
  readonly title: { readonly default: string | null };
  readonly coverage: string;
  readonly type: string;
  readonly max_winners: number | null;
  readonly win_threshold: number | null;
  readonly uncontested: boolean;
  readonly tabulation_method: string;
  readonly certified: boolean;
  readonly race_call_status: string;
  readonly outcome: { readonly won: readonly string[] } | null;
  readonly candidate_metadata: Readonly<Record<string, FeedCandidateMeta>>;
  readonly reporting_units: readonly FeedUnit[];
}
interface Feed {
  readonly races: readonly FeedRace[];
  readonly resultsMeta: { readonly resultsUpdatedAt: string };
}

const LEGISLATURE = new Set(["State House", "State Senate", "State Assembly", "House of Delegates", "State Legislature"]);
const CONGRESS = new Set(["U.S. Senate", "U.S. House"]);
const MEASURE_ANSWERS = new Set(["yes", "no"]);

const categoryOf = (race: FeedRace): Category => {
  const ids = Object.keys(race.candidate_metadata);
  if (race.ballot_measure_text !== null || (ids.length > 0 && ids.every((id) => MEASURE_ANSWERS.has(id)))) return "measure";
  if (CONGRESS.has(race.office)) return "congress";
  if (LEGISLATURE.has(race.office)) return "legislature";
  if (race.coverage === "state") return "statewide";
  return "local";
};

const statusOf = (race: FeedRace): Status => {
  if (race.certified) return "certified";
  if (race.race_call_status === "called") return "called";
  return "counting";
};

// Short party labels; candidates without a meaningful party get none.
const PARTY_LABELS: Readonly<Record<string, string>> = {
  DEM: "D", GOP: "R", IND: "I", NPA: "I", UNA: "I", LIB: "L", GRN: "G", CST: "C", CON: "C",
  WF: "WF", PRG: "P", WCP: "WC", UST: "UST", IAP: "IA", FWD: "F",
};

const partyOf = (meta: FeedCandidateMeta): string | null =>
  meta.party === null ? null : (PARTY_LABELS[meta.party.nyt_id] ?? null);

const nameOf = (meta: FeedCandidateMeta): string =>
  [meta.first_name, meta.last_name].filter((part) => part !== null && part !== "").join(" ");

const toRace = (race: FeedRace, stateName: string): Race | null => {
  if (race.uncontested || race.type.includes("Primary")) return null;
  const unit = race.reporting_units.find((u) => u.level === "state");
  if (unit === undefined || unit.total_votes === 0) return null;

  const seats = race.max_winners ?? 1;
  const ranked = [...unit.candidates].sort((a, b) => b.votes.total - a.votes.total);
  if (ranked.length <= seats) return null;

  const won = new Set(race.outcome?.won ?? []);
  const candidates: Candidate[] = ranked.slice(0, seats + 1).map((c) => {
    const meta = race.candidate_metadata[c.nyt_id];
    if (meta === undefined) throw new Error(`${race.nyt_id}: no metadata for candidate ${c.nyt_id}`);
    return { name: nameOf(meta), party: partyOf(meta), votes: c.votes.total, won: won.has(c.nyt_id) };
  });

  const category = categoryOf(race);
  const lastIn = candidates[seats - 1]!;
  const firstOut = candidates[seats]!;
  // A measure that needs a supermajority is decided by its distance from the
  // threshold, not by the gap between yes and no.
  const threshold = category === "measure" && race.win_threshold !== null && race.win_threshold !== 50 ? race.win_threshold : null;
  const margin =
    threshold !== null
      ? Math.round(Math.abs(lastIn.votes - (threshold / 100) * (lastIn.votes + firstOut.votes)))
      : lastIn.votes - firstOut.votes;

  return {
    id: race.nyt_id,
    state: unit.state_postal,
    stateName,
    category,
    office: race.office,
    seat: category === "measure" ? (race.title.default ?? race.seat) : race.seat,
    seats,
    rankedChoice: race.tabulation_method === "ranked-choice",
    threshold,
    margin,
    totalVotes: unit.total_votes,
    counted: unit.eevp ?? 0,
    status: statusOf(race),
    candidates,
  };
};

const dir = rawDir(ELECTION);
const races = new Map<string, Race>();
let resultsUpdatedAt = "";

for (const { slug, name } of STATES) {
  const feed: Feed = await Bun.file(`${dir}/${slug}.json`).json();
  if (feed.resultsMeta.resultsUpdatedAt > resultsUpdatedAt) resultsUpdatedAt = feed.resultsMeta.resultsUpdatedAt;
  for (const raw of feed.races) {
    const race = toRace(raw, name);
    if (race !== null) races.set(race.id, race);
  }
}

const sorted = [...races.values()].sort((a, b) => a.margin - b.margin || b.totalVotes - a.totalVotes);
const dataset: Dataset = { election: ELECTION, fetchedAt: new Date().toISOString(), resultsUpdatedAt, races: sorted };
await Bun.write("public/races.json", JSON.stringify(dataset));

const within = (n: number) => sorted.filter((r) => r.margin <= n).length;
console.log(`${sorted.length} races · ≤1: ${within(1)} · ≤10: ${within(10)} · ≤100: ${within(100)} · ≤1000: ${within(1000)}`);
