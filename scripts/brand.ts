// Draws the favicon, the Apple touch icon and the Open Graph image into
// public/. Run with `bun scripts/brand.ts` after changing the design.

import { Resvg } from "@resvg/resvg-js";

const FONTS = [
  "assets/fonts/InstrumentSerif-Regular.ttf",
  "assets/fonts/Inter-Regular.ttf",
  "assets/fonts/Inter-Medium.ttf",
];

const INK = "#0a0a0a";
const PAPER = "#ffffff";
const MUTED = "#525252";
const CROWD = "#e0e0e0";

// The person from the page's crowd (src/style.css), on a 12 by 12 grid.
const person = (x: number, y: number, size: number, fill: string) =>
  `<g transform="translate(${x} ${y}) scale(${size / 12})" fill="${fill}"><circle cx="6" cy="3.1" r="2.1"/><path d="M2.3 11.6C2.3 8 3.9 6.2 6 6.2S9.7 8 9.7 11.6Z"/></g>`;

const png = (svg: string, width: number) =>
  new Resvg(svg, {
    fitTo: { mode: "width", value: width },
    font: { fontFiles: FONTS, loadSystemFonts: false, defaultFontFamily: "Inter" },
  })
    .render()
    .asPng();

// One person on a rounded square. The SVG flips to white in dark browsers.
const icon = (dark: boolean) => {
  const square = dark ? PAPER : INK;
  const glyph = dark ? INK : PAPER;
  return `<rect width="32" height="32" rx="7" fill="${square}"/>${person(2, 8.5, 15, glyph)}${person(15, 8.5, 15, glyph)}`;
};

const faviconSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
<style>.dark{display:none}@media (prefers-color-scheme:dark){.light{display:none}.dark{display:inline}}</style>
<g class="light">${icon(false)}</g><g class="dark">${icon(true)}</g>
</svg>
`;

const iconPng = (size: number, rounded: boolean) =>
  png(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">${rounded ? icon(false) : `<rect width="32" height="32" fill="${INK}"/>${person(2, 8.5, 15, PAPER)}${person(15, 8.5, 15, PAPER)}`}</svg>`,
    size,
  );

// An .ico holding PNG images, which every browser that asks for
// /favicon.ico understands.
const ico = (images: readonly { readonly size: number; readonly data: Uint8Array }[]) => {
  const header = Buffer.alloc(6 + 16 * images.length);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(images.length, 4);
  let offset = header.length;
  images.forEach(({ size, data }, i) => {
    const entry = 6 + 16 * i;
    header.writeUInt8(size >= 256 ? 0 : size, entry);
    header.writeUInt8(size >= 256 ? 0 : size, entry + 1);
    header.writeUInt16LE(1, entry + 4);
    header.writeUInt16LE(32, entry + 6);
    header.writeUInt32LE(data.length, entry + 8);
    header.writeUInt32LE(offset, entry + 12);
    offset += data.length;
  });
  return Buffer.concat([header, ...images.map(({ data }) => Buffer.from(data))]);
};

// A crowd in pale grey, with the two people who decided the closest races
// picked out in ink.
const og = () => {
  const width = 1200;
  const height = 630;
  const left = 80;
  // Three rows of people, spaced so the crowd spans the same margins as the text.
  const size = 30;
  const columns = 29;
  const cell = (width - left * 2 - size) / (columns - 1);
  const rows = 3;
  const top = 366;
  const highlighted = new Set(["1,4", "1,5"]);
  const crowd = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, (_, column) =>
      person(left + column * cell, top + row * (size + 8), size, highlighted.has(`${row},${column}`) ? INK : CROWD),
    ).join(""),
  ).join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
<rect width="${width}" height="${height}" fill="${PAPER}"/>
<text x="${left - 6}" y="218" font-family="Instrument Serif" font-size="176" letter-spacing="-3.5" fill="${INK}">Decided by</text>
<text x="${left}" y="292" font-family="Inter" font-size="36" fill="${MUTED}">Every race in the 2026 midterms, closest first.</text>
${crowd}
<text x="${left}" y="${height - 56}" font-family="Inter" font-weight="500" font-size="26" fill="${INK}">didmyvotematter.com</text>
<text x="${width - left}" y="${height - 56}" text-anchor="end" font-family="Inter" font-size="26" fill="${MUTED}">Each person is one vote.</text>
</svg>`;
};

await Bun.write("public/favicon.svg", faviconSvg);
await Bun.write("public/favicon.ico", ico([16, 32, 48].map((size) => ({ size, data: iconPng(size, true) }))));
// iOS rounds the corners itself, so the touch icon is a full square.
await Bun.write("public/apple-touch-icon.png", iconPng(180, false));
await Bun.write("public/og.png", png(og(), 1200));
console.log("wrote public/favicon.svg, favicon.ico, apple-touch-icon.png, og.png");
