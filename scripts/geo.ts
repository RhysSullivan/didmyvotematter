// Works out which counties' voters had a race on their ballot, from Census
// 2020 county geography and the 2024 state legislative districts.

const BASE = "https://www2.census.gov/geo/docs";
const FILES = {
  counties: `${BASE}/reference/codes2020/national_county2020.txt`,
  places: `${BASE}/reference/codes2020/national_place_by_county2020.txt`,
  congress: `${BASE}/maps-data/data/rel2020/cd-sld/tab20_cd11920_county20_natl.txt`,
  upper: `${BASE}/maps-data/data/rel2020/cd-sld/tab20_sldu202420_county20_natl.txt`,
  lower: `${BASE}/maps-data/data/rel2020/cd-sld/tab20_sldl202420_county20_natl.txt`,
} as const;

export const CENSUS_DIR = "data/raw/census";

const fileName = (url: string) => url.slice(url.lastIndexOf("/") + 1);

export const fetchCensus = async () => {
  for (const url of Object.values(FILES)) {
    const path = `${CENSUS_DIR}/${fileName(url)}`;
    if (await Bun.file(path).exists()) continue;
    const response = await fetch(url, { headers: { "user-agent": "decided-by" } });
    if (!response.ok) throw new Error(`${url}: ${response.status}`);
    await Bun.write(path, await response.text());
  }
};

const readRows = async (url: string) => {
  const text = await Bun.file(`${CENSUS_DIR}/${fileName(url)}`).text();
  const [header, ...lines] = text.replace(/^﻿/, "").trim().split(/\r?\n/);
  const columns = header!.split("|");
  return lines.map((line) => {
    const cells = line.split("|");
    return Object.fromEntries(columns.map((column, i) => [column, cells[i] ?? ""]));
  });
};

// Boundaries drawn on different data leave slivers, and some districts share
// only water with a county. An overlap counts when it's at least 1% of the
// district's land or 1% of the county's.
const substantial = (row: Readonly<Record<string, string>>, districtLand: string) => {
  const part = Number(row.AREALAND_PART);
  return part >= 0.01 * Number(row[districtLand]) || part >= 0.01 * Number(row.AREALAND_COUNTY_20);
};

const addTo = (map: Map<string, Set<string>>, key: string, value: string) => {
  const set = map.get(key);
  if (set === undefined) map.set(key, new Set([value]));
  else set.add(value);
};

// "State House District Belknap 01", "Belknap District 1" and "Belknap 1" all
// become "belknap 1"; "1st Bristol & Plymouth" becomes "1st bristol and plymouth".
const ORDINALS: Readonly<Record<string, string>> = {
  first: "1st", second: "2nd", third: "3rd", fourth: "4th", fifth: "5th",
  sixth: "6th", seventh: "7th", eighth: "8th", ninth: "9th", tenth: "10th",
};

export const districtKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\b(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth|tenth)\b/g, (word) => ORDINALS[word]!)
    .replace(/&/g, " and ")
    .replace(/\s+-\s+position\s+\S+$/, "")
    .replace(/\b(state|house|senate|senatorial|assembly|delegate|representative|legislative|district|subdistrict|position)\b/g, " ")
    .replace(/[()\-–,.'’]/g, " ")
    .split(/\s+/)
    .filter((token) => token !== "")
    .map((token) => token.replace(/^0+(?=\d)/, ""))
    .join(" ");

const ABBREVIATIONS: readonly (readonly [RegExp, string])[] = [
  [/^s\.f\.\s/, "san francisco "],
  [/^n\.y\.c\.\s/, "new york "],
  [/^l\.a\.\s/, "los angeles "],
  [/^director\s/, ""],
];

const placeText = (text: string) => {
  let out = text.toLowerCase();
  for (const [pattern, replacement] of ABBREVIATIONS) out = out.replace(pattern, replacement);
  return out.replace(/[.,’']/g, "");
};

const COUNTY_SUFFIX = /\s+(county|parish|borough|census area|city and borough|municipality)$/;
const PLACE_SUFFIX = /\s+(city|town|village|borough|municipality|urban county|metro government \(balance\)|consolidated government \(balance\)|\(balance\))$/;

export interface Geo {
  readonly countyName: (fips: string) => string;
  readonly congressional: (stateFips: string, district: string) => readonly string[];
  readonly legislative: (stateFips: string, chamber: "upper" | "lower", seat: string) => readonly string[] | null;
  readonly place: (stateFips: string, text: string) => readonly string[] | null;
}

export const loadGeo = async (): Promise<Geo> => {
  const countyNames = new Map<string, string>();
  // Per state: candidate name (lowercase) to the counties it covers.
  const countyByName = new Map<string, Map<string, Set<string>>>();
  for (const row of await readRows(FILES.counties)) {
    const fips = `${row.STATEFP}${row.COUNTYFP}`;
    countyNames.set(fips, row.COUNTYNAME!);
    const byName = countyByName.get(row.STATEFP!) ?? new Map<string, Set<string>>();
    countyByName.set(row.STATEFP!, byName);
    addTo(byName, row.COUNTYNAME!.toLowerCase().replace(COUNTY_SUFFIX, "").replace(/[.’']/g, ""), fips);
  }

  const placeByName = new Map<string, Map<string, Set<string>>>();
  for (const row of await readRows(FILES.places)) {
    if (row.TYPE !== "INCORPORATED PLACE") continue;
    const byName = placeByName.get(row.STATEFP!) ?? new Map<string, Set<string>>();
    placeByName.set(row.STATEFP!, byName);
    const full = row.PLACENAME!.toLowerCase().replace(PLACE_SUFFIX, "").replace(/[.’']/g, "");
    // "Louisville/Jefferson County metro government" answers to either name.
    for (const name of [full, ...full.split(/[/-]/)]) addTo(byName, name.trim(), `${row.STATEFP}${row.COUNTYFP}`);
  }

  const relationships = async (url: string, geoid: string, name: string) => {
    const map = new Map<string, Set<string>>();
    for (const row of await readRows(url)) {
      const id = row[geoid]!;
      if (id === "" || !substantial(row, geoid.replace("GEOID", "AREALAND"))) continue;
      addTo(map, `${id.slice(0, 2)}|${districtKey(row[name]!)}`, row.GEOID_COUNTY_20!);
    }
    return map;
  };
  const congress = new Map<string, Set<string>>();
  for (const row of await readRows(FILES.congress)) {
    const id = row.GEOID_CD119_20!;
    if (id !== "" && substantial(row, "AREALAND_CD119_20")) addTo(congress, id, row.GEOID_COUNTY_20!);
  }
  const upper = await relationships(FILES.upper, "GEOID_SLDU2024_20", "NAMELSAD_SLDU2024_20");
  const lower = await relationships(FILES.lower, "GEOID_SLDL2024_20", "NAMELSAD_SLDL2024_20");

  // The longest county or city name the text starts with. A county wins a
  // tie only when the text says "County" right after the name.
  const place = (stateFips: string, text: string) => {
    const normalized = placeText(text);
    const best = (byName: Map<string, Set<string>> | undefined) => {
      let match: { name: string; fips: Set<string> } | null = null;
      for (const [name, fips] of byName ?? []) {
        if (name === "") continue;
        const fits = normalized === name || normalized.startsWith(`${name} `) || normalized.startsWith(`${name}-`);
        if (fits && (match === null || name.length > match.name.length)) match = { name, fips };
      }
      return match;
    };
    const county = best(countyByName.get(stateFips));
    const city = best(placeByName.get(stateFips));
    if (county === null && city === null) return null;
    if (county === null) return [...city!.fips];
    if (city === null) return [...county.fips];
    if (county.name.length > city.name.length) return [...county.fips];
    if (city.name.length > county.name.length) return [...city.fips];
    return normalized.slice(county.name.length).trimStart().startsWith("county") ? [...county.fips] : [...city.fips];
  };

  return {
    countyName: (fips) => {
      const name = countyNames.get(fips);
      if (name === undefined) throw new Error(`unknown county ${fips}`);
      return name;
    },
    congressional: (stateFips, district) => [...(congress.get(`${stateFips}${district.padStart(2, "0")}`) ?? [])],
    legislative: (stateFips, chamber, seat) => {
      const lookup = (district: string) => {
        const key = `${stateFips}|${district}`;
        // Some states draw their lower chamber on the upper chamber's districts.
        return chamber === "upper" ? upper.get(key) : (lower.get(key) ?? upper.get(key));
      };
      const district = districtKey(seat);
      // Idaho's "Position 33A" is seat A of district 33.
      const found = lookup(district) ?? (/^\d+[a-z]$/.test(district) ? lookup(district.slice(0, -1)) : undefined);
      if (found !== undefined) return [...found];
      // New Hampshire's floterial districts overlay others and aren't in the
      // Census files, but they're named for their county.
      return place(stateFips, seat);
    },
    place,
  };
};
