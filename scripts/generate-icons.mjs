#!/usr/bin/env node
// Renders the app icons (app/public/icons/icon-*.png) from
// app/public/icons/icon.svg: the design's lime accent with the wallet mark.
// The large ones are full-bleed squares (iOS and Android round the corners
// themselves; the mark sits well inside the maskable safe zone); the 32px
// browser-tab icon has its own rounded corners.
//
// Needs Playwright with Chromium (preinstalled in the Claude Code cloud
// environment; locally: npm i -D playwright && npx playwright install chromium).
// Usage: node scripts/generate-icons.mjs
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { chromium } from "playwright";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DIR = join(__dirname, "..", "app", "public", "icons");
const svg = readFileSync(join(DIR, "icon.svg"), "utf8");

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_BROWSERS_PATH ? { executablePath: "/opt/pw-browsers/chromium" } : {},
);
const page = await browser.newPage();
for (const size of [32, 180, 192, 512]) {
  await page.setViewportSize({ width: size, height: size });
  // The favicon is shown as-is, so it gets rounded corners; the others are rounded by the phone.
  const radius = size === 32 ? "22%" : "0";
  await page.setContent(
    `<html><body style="margin:0;background:transparent">
      <div style="width:${size}px;height:${size}px;border-radius:${radius};overflow:hidden">${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}</div>
    </body></html>`,
  );
  const path = join(DIR, `icon-${size}.png`);
  await page.screenshot({ path, omitBackground: true, clip: { x: 0, y: 0, width: size, height: size } });
  console.log("wrote", path);
}
await browser.close();
