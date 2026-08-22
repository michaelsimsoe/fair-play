import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import sharp from "sharp";

const source = resolve("assets/fair-play-icon.png");
const output = resolve("public/icons");
const splashOutput = resolve("public/splash");
const appBackground = { r: 244, g: 240, b: 229, alpha: 1 };

await Promise.all([
  mkdir(output, { recursive: true }),
  mkdir(splashOutput, { recursive: true }),
]);

const renderInstallIcon = async (filename, size, artworkScale) => {
  const artworkSize = Math.round(size * artworkScale);
  const artwork = await sharp(source)
    .resize(artworkSize, artworkSize, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toBuffer();

  await sharp({
    create: {
      width: size,
      height: size,
      channels: 4,
      background: appBackground,
    },
  })
    .composite([{ input: artwork, gravity: "center" }])
    .png({ compressionLevel: 9 })
    .toFile(resolve(output, filename));
};

await Promise.all([
  renderInstallIcon("icon-192.png", 192, 0.88),
  renderInstallIcon("icon-512.png", 512, 0.88),
  renderInstallIcon("icon-maskable-512.png", 512, 0.68),
  renderInstallIcon("apple-touch-icon.png", 180, 0.86),
  sharp(source)
    .resize(32, 32, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toFile(resolve(output, "favicon-32.png")),
  sharp(source)
    .resize(16, 16, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toFile(resolve(output, "favicon-16.png")),
]);

const launchScreens = [
  { cssWidth: 320, cssHeight: 568, dpr: 2 },
  { cssWidth: 375, cssHeight: 667, dpr: 2 },
  { cssWidth: 375, cssHeight: 812, dpr: 3 },
  { cssWidth: 390, cssHeight: 844, dpr: 3 },
  { cssWidth: 393, cssHeight: 852, dpr: 3 },
  { cssWidth: 402, cssHeight: 874, dpr: 3 },
  { cssWidth: 414, cssHeight: 896, dpr: 2 },
  { cssWidth: 414, cssHeight: 896, dpr: 3 },
  { cssWidth: 428, cssHeight: 926, dpr: 3 },
  { cssWidth: 430, cssHeight: 932, dpr: 3 },
  { cssWidth: 440, cssHeight: 956, dpr: 3 },
];

const renderSplash = async (screen, orientation) => {
  const portraitWidth = screen.cssWidth * screen.dpr;
  const portraitHeight = screen.cssHeight * screen.dpr;
  const width = orientation === "portrait" ? portraitWidth : portraitHeight;
  const height = orientation === "portrait" ? portraitHeight : portraitWidth;
  const artworkSize = Math.round(Math.min(width, height) * 0.36);
  const artwork = await sharp(source)
    .resize(artworkSize, artworkSize, { fit: "contain" })
    .png({ compressionLevel: 9 })
    .toBuffer();
  const filename = `${screen.cssWidth}x${screen.cssHeight}@${screen.dpr}x-${orientation}.png`;

  await sharp({
    create: {
      width,
      height,
      channels: 4,
      background: appBackground,
    },
  })
    .composite([{ input: artwork, gravity: "center" }])
    .png({
      compressionLevel: 9,
      palette: true,
      quality: 90,
      colours: 256,
    })
    .toFile(resolve(splashOutput, filename));
};

for (const screen of launchScreens) {
  await Promise.all([
    renderSplash(screen, "portrait"),
    renderSplash(screen, "landscape"),
  ]);
}
