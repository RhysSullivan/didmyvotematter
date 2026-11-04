# Decided by

Every race in the 2026 midterms, closest first. Each dot is one voter.

## Refresh the results

The live site refreshes itself: a systemd user timer on minisforum runs
`scripts/refresh.sh` every 30 minutes, which pulls `main`, re-downloads the
results and deploys only when they've changed. Install it with:

```sh
ln -sf ~/agent-workspace/decided-by/deploy/decided-by-refresh.{service,timer} ~/.config/systemd/user/
systemctl --user daemon-reload && systemctl --user enable --now decided-by-refresh.timer
journalctl --user -u decided-by-refresh   # logs
```

By hand:

```sh
bun install
bun run data    # download every state's results and build public/races.json (not committed)
bun run build   # static site in dist/
```

`bun run dev` serves it locally.

The build writes every race into `index.html` (the `prerender` plugin in
`vite.config.ts`, using the same `src/render.ts` the browser uses), so the
page shows the list without running any script. The browser loads
`races.json` in the background, only to redraw the list for a filter and to
fill in a race's details when it's opened.

## Favicon and share image

`bun scripts/brand.ts` draws `public/favicon.svg`, `favicon.ico`,
`apple-touch-icon.png` and the Open Graph image `og.png` from code, using the
fonts in `assets/fonts` (both under the SIL Open Font License, included).

## Data

`scripts/fetch.ts` downloads the New York Times results feed for each state
(AP data) into `data/raw/<election>/`. `scripts/build-data.ts` keeps contested
general-election races with votes counted. For each one it computes the margin
between the last winning candidate and the first losing one. For
supermajority ballot measures, the margin is the distance from the threshold.

Each race also lists the counties whose voters had it on their ballot, so a
county view can show that county's whole ballot. House districts come from
the feed's county breakdown, which uses the 2026 maps. Legislative districts
come from the Census Bureau's 2024 district-to-county files, and local races
are matched by city or county name using its 2020 place-by-county list.
Overlaps under 1% of a district's or county's land are ignored. About 50
state board races elected from multi-county districts have no county mapping,
so they only appear in their state's full list.

These results are unofficial until each state certifies them, which happens
between Nov 10 and Dec 18, 2026. Ranked-choice races show first-choice votes.
