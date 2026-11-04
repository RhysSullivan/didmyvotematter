// Downloads the current results for every state from the New York Times
// results feeds (AP data) into data/raw/<election>/.

import { mkdir } from "node:fs/promises";
import { fetchCensus } from "./geo";
import { ELECTION, STATES, rawDir } from "./states";

const dir = rawDir(ELECTION);
await mkdir(dir, { recursive: true });

const results = await Promise.all(
  // "house" is the national House file, which breaks districts down by county.
  [...STATES, { slug: "house" }].map(async ({ slug }) => {
    const url = `https://static01.nyt.com/elections-assets/pages/data/${ELECTION}/results-${slug}.json`;
    const response = await fetch(url, { headers: { "user-agent": "decided-by (results archive)" } });
    if (!response.ok) return { slug, ok: false as const, status: response.status };
    await Bun.write(`${dir}/${slug}.json`, await response.text());
    return { slug, ok: true as const };
  }),
);

await fetchCensus();

const failed = results.filter((r) => !r.ok);
console.log(`fetched ${results.length - failed.length}/${results.length} states into ${dir}`);
if (failed.length > 0) {
  console.error("failed:", failed.map((f) => `${f.slug} (${"status" in f ? f.status : "?"})`).join(", "));
  process.exit(1);
}
