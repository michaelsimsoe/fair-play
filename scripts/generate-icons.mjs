import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const source = resolve("public/icons/icon.svg");
const output = resolve("public/icons");

await mkdir(output, { recursive: true });
await Promise.all([
  sharp(source).resize(192, 192).png().toFile(resolve(output, "icon-192.png")),
  sharp(source).resize(512, 512).png().toFile(resolve(output, "icon-512.png")),
  sharp(source).resize(180, 180).png().toFile(resolve(output, "apple-touch-icon.png")),
]);
