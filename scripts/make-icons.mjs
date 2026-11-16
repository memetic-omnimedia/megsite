// One-off helper: regenerate favicon PNGs from public/favicon.svg and the
// 1200x630 share image from public/media/poster.jpg.  Run: node scripts/make-icons.mjs
import sharp from 'sharp';
const svg = new URL('../public/favicon.svg', import.meta.url).pathname;
const pub = new URL('../public/', import.meta.url).pathname;
await sharp(svg, { density: 384 }).resize(180, 180).png().toFile(pub + 'apple-touch-icon.png');
await sharp(svg, { density: 384 }).resize(32, 32).png().toFile(pub + 'favicon-32.png');
await sharp(svg, { density: 384 }).resize(512, 512).png().toFile(pub + 'icon-512.png');
await sharp(pub + 'media/poster.jpg')
  .resize(1200, 630, { fit: 'cover', position: 'attention' })
  .modulate({ brightness: 0.92 })
  .jpeg({ quality: 82, mozjpeg: true })
  .toFile(pub + 'og.jpg');
console.log('icons + og.jpg written');
