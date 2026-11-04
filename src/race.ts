// The shape of public/races.json, shared by the data build and the page.

export type Category = "congress" | "statewide" | "legislature" | "local" | "measure";

// certified: the state has certified the result.
// called: a winner has been projected but counting may continue.
// counting: no projection yet.
export type Status = "certified" | "called" | "counting";

export interface Candidate {
  readonly name: string;
  readonly lastName: string;
  readonly party: string | null;
  readonly votes: number;
  readonly won: boolean;
}

export interface Race {
  readonly id: string;
  readonly state: string;
  readonly stateName: string;
  readonly category: Category;
  readonly office: string;
  readonly seat: string | null;
  // What a ballot measure does, or the area a U.S. House district covers.
  readonly description: string | null;
  readonly seats: number;
  readonly rankedChoice: boolean;
  // Percent of the vote a measure needs to pass, when that isn't a simple
  // majority. Its margin is then the distance from this line.
  readonly threshold: number | null;
  // Votes separating the last winning candidate from the first losing one.
  readonly margin: number;
  readonly totalVotes: number;
  // Percent of the expected vote counted, as estimated by AP.
  readonly counted: number;
  readonly status: Status;
  // Ordered by votes, highest first. Only the candidates either side of the
  // cut line plus the winners are kept.
  readonly candidates: readonly Candidate[];
}

export interface Dataset {
  readonly election: string;
  readonly fetchedAt: string;
  readonly resultsUpdatedAt: string;
  readonly races: readonly Race[];
}
