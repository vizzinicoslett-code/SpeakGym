// Reproduce the existing waveform icon as installable PNGs without native dependencies.
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { deflateSync } from 'node:zlib';

const publicDirectory = fileURLToPath(new URL('../public/', import.meta.url));
mkdirSync(publicDirectory, { recursive: true });

function crc32(buffer) {
  let value = 0xffffffff;
  for (const byte of buffer) {
    value ^= byte;
    for (let bit = 0; bit < 8; bit += 1) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  }
  return (value ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const tag = Buffer.from(type);
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([tag, data])));
  return Buffer.concat([length, tag, data, crc]);
}

function icon(size) {
  const pixels = Buffer.alloc((size * 4 + 1) * size);
  const bars = [[51, 77, 115], [81, 52, 140], [111, 66, 126], [141, 81, 111]];
  const background = [230, 88, 53];
  const foreground = [255, 255, 255];
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      let coverage = 0;
      for (let sy = 0; sy < 4; sy += 1) {
        for (let sx = 0; sx < 4; sx += 1) {
          const px = (x + (sx + 0.5) / 4) * 192 / size;
          const py = (y + (sy + 0.5) / 4) * 192 / size;
          if (bars.some(([centerX, top, bottom]) => {
            const nearestY = Math.max(top, Math.min(bottom, py));
            return (px - centerX) ** 2 + (py - nearestY) ** 2 <= 36;
          })) coverage += 1 / 16;
        }
      }
      const offset = y * (size * 4 + 1) + 1 + x * 4;
      for (let channel = 0; channel < 3; channel += 1) {
        pixels[offset + channel] = Math.round(background[channel] * (1 - coverage) + foreground[channel] * coverage);
      }
      pixels[offset + 3] = 255;
    }
  }
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8;
  header[9] = 6;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', header), chunk('IDAT', deflateSync(pixels)), chunk('IEND', Buffer.alloc(0)),
  ]);
}

for (const size of [192, 512]) {
  const output = new URL(`../public/icon-${size}.png`, import.meta.url);
  writeFileSync(output, icon(size));
  console.log(`Generated ${fileURLToPath(output)}`);
}
