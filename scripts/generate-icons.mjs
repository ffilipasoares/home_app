#!/usr/bin/env node
// Generates placeholder PWA icons (solid brand-blue squares) so the app has
// something valid to reference in its manifest from day one. Swap these for
// real artwork whenever you like — just keep the same file names/sizes, or
// update vite.config.ts + index.html if you rename them.
//
// Usage: node scripts/generate-icons.mjs
import { deflateSync, crc32 } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = join(__dirname, "..", "app", "public", "icons");

// Brand blue (categorical slot 1 / sequential-500) from the dataviz palette.
const BG = [0x25, 0x6a, 0xbf, 0xff];

function crc32Buf(buf) {
  // node:zlib.crc32 returns an unsigned 32-bit integer.
  return crc32(buf) >>> 0;
}

function chunk(type, data) {
  const typeBuf = Buffer.from(type, "ascii");
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([typeBuf, data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32Buf(body), 0);
  return Buffer.concat([len, body, crc]);
}

function solidPng(size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0); // width
  ihdr.writeUInt32BE(size, 4); // height
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // A simple centered rounded-square "card" motif: full bleed background,
  // plus a lighter inset square so it doesn't look like a totally blank
  // tile — kept as plain geometry, no font rendering needed.
  const inset = Math.round(size * 0.28);
  const raw = Buffer.alloc((size * 4 + 1) * size);
  for (let y = 0; y < size; y++) {
    const rowStart = y * (size * 4 + 1);
    raw[rowStart] = 0; // filter type: none
    for (let x = 0; x < size; x++) {
      const inCard = x >= inset && x < size - inset && y >= inset && y < size - inset;
      const px = rowStart + 1 + x * 4;
      if (inCard) {
        raw[px] = 0xff;
        raw[px + 1] = 0xff;
        raw[px + 2] = 0xff;
        raw[px + 3] = 0xff;
      } else {
        raw[px] = BG[0];
        raw[px + 1] = BG[1];
        raw[px + 2] = BG[2];
        raw[px + 3] = BG[3];
      }
    }
  }

  const idat = deflateSync(raw);
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

mkdirSync(OUT_DIR, { recursive: true });
const sizes = [32, 180, 192, 512];
for (const size of sizes) {
  const path = join(OUT_DIR, `icon-${size}.png`);
  writeFileSync(path, solidPng(size));
  console.log("wrote", path);
}
