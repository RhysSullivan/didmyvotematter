import { readFileSync } from "node:fs";
import tailwindcss from "@tailwindcss/vite";
import { type Plugin, defineConfig } from "vite";
import type { Dataset } from "./src/race";
import { levelOptions, renderList, sourceText, stateOptions } from "./src/render";

// Writes every race into index.html, so the page needs no script or data
// request to show the list.
const prerender = (): Plugin => ({
  name: "prerender",
  transformIndexHtml(html) {
    const dataset: Dataset = JSON.parse(readFileSync("public/races.json", "utf8"));
    const slots: Record<string, string> = {
      levels: levelOptions("all"),
      states: stateOptions(dataset.races, ""),
      races: renderList(dataset.races, new Set()),
      source: sourceText(dataset),
    };
    return html.replace(/<!-- (\w+) -->/g, (slot, name: string) => {
      const filled = slots[name];
      if (filled === undefined) throw new Error(`index.html: no content for ${slot}`);
      return filled;
    });
  },
});

export default defineConfig({ plugins: [tailwindcss(), prerender()] });
