# Decided by

Every race in the 2026 midterms, closest first. Each dot is one voter.

## Refresh the results

```sh
bun install
bun run data    # download every state's results and rebuild public/races.json
bun run build   # static site in dist/
```

`bun run dev` serves it locally.

## Data

`scripts/fetch.ts` downloads the New York Times results feed for each state
(AP data) into `data/raw/<election>/`. `scripts/build-data.ts` keeps contested
general-election races with votes counted. For each one it computes the margin
between the last winning candidate and the first losing one. For
supermajority ballot measures, the margin is the distance from the threshold.

These results are unofficial until each state certifies them, which happens
between Nov 10 and Dec 18, 2026. Ranked-choice races show first-choice votes.
