// Generates original SVG illustrations for the demo catalog into public/demo/.
// Run: node scripts/make-demo-images.mjs   (output is committed; no external images are used)
import { mkdirSync, writeFileSync } from "node:fs";

const OUT = new URL("../public/demo/", import.meta.url);
mkdirSync(OUT, { recursive: true });

const COLORS = {
  white: "#f7f6f2",
  black: "#22212a",
  navy: "#1f2b4d",
  red: "#c8382f",
  grey: "#9a99a3",
  forest: "#2f5d47",
  beige: "#d9c8a9",
  natural: "#eadfca",
  pink: "#f2b8c6",
  sky: "#9cc8ea",
  mustard: "#d9a52b",
  clear: "#e8eef3",
};
const BG = ["#fff1ec", "#efeaff", "#eaf6ef", "#fff7e0", "#eaf2fb", "#fdeef4"];

// a small original artwork printed on each product (sun + hills, star burst, wave, heart…)
const ARTS = [
  (x, y, s) => `<circle cx="${x}" cy="${y - s * 0.1}" r="${s * 0.32}" fill="#ff7a45"/><path d="M${x - s * 0.55} ${y + s * 0.35} q${s * 0.28} -${s * 0.45} ${s * 0.55} 0 q${s * 0.28} -${s * 0.3} ${s * 0.55} 0 z" fill="#6d4aff"/>`,
  (x, y, s) => `<polygon points="${[...Array(10)].map((_, i) => { const r = i % 2 ? s * 0.18 : s * 0.42; const a = (Math.PI / 5) * i - Math.PI / 2; return `${x + r * Math.cos(a)},${y + r * Math.sin(a)}`; }).join(" ")}" fill="#ffcc33" stroke="#ff5a36" stroke-width="${s * 0.04}"/>`,
  (x, y, s) => `<path d="M${x - s * 0.5} ${y} q${s * 0.25} -${s * 0.3} ${s * 0.5} 0 t${s * 0.5} 0" fill="none" stroke="#2bb3a3" stroke-width="${s * 0.12}" stroke-linecap="round"/><path d="M${x - s * 0.5} ${y + s * 0.25} q${s * 0.25} -${s * 0.3} ${s * 0.5} 0 t${s * 0.5} 0" fill="none" stroke="#6d4aff" stroke-width="${s * 0.12}" stroke-linecap="round"/>`,
  (x, y, s) => `<path d="M${x} ${y + s * 0.38} C ${x - s * 0.6} ${y}, ${x - s * 0.35} ${y - s * 0.45}, ${x} ${y - s * 0.15} C ${x + s * 0.35} ${y - s * 0.45}, ${x + s * 0.6} ${y}, ${x} ${y + s * 0.38} z" fill="#ff4f79"/>`,
  (x, y, s) => `<path d="M${x - s * 0.5} ${y + s * 0.3} L${x - s * 0.15} ${y - s * 0.35} L${x + s * 0.05} ${y} L${x + s * 0.2} ${y - s * 0.2} L${x + s * 0.5} ${y + s * 0.3} z" fill="#2f5d47"/><circle cx="${x + s * 0.28}" cy="${y - s * 0.32}" r="${s * 0.1}" fill="#ffcc33"/>`,
  (x, y, s) => `<rect x="${x - s * 0.4}" y="${y - s * 0.4}" width="${s * 0.8}" height="${s * 0.8}" rx="${s * 0.2}" fill="#6d4aff"/><circle cx="${x}" cy="${y}" r="${s * 0.22}" fill="#fff"/><circle cx="${x}" cy="${y}" r="${s * 0.1}" fill="#ff5a36"/>`,
];

const stroke = (c) => (c === "#22212a" || c === "#1f2b4d" || c === "#2f5d47" ? "#0d0c12" : "#2a2933");

const SHAPES = {
  tshirt: (c, art) => `<path d="M140 110 L95 128 L48 185 L92 222 L118 196 L118 420 L282 420 L282 196 L308 222 L352 185 L305 128 L260 110 Q200 150 140 110 Z" fill="${c}" stroke="${stroke(c)}" stroke-width="5" stroke-linejoin="round"/>${art(200, 255, 100)}`,
  hoodie: (c, art) => `<path d="M145 115 Q200 60 255 115 L310 135 L352 260 L312 278 L292 215 L292 420 L108 420 L108 215 L88 278 L48 260 L90 135 Z" fill="${c}" stroke="${stroke(c)}" stroke-width="5" stroke-linejoin="round"/><path d="M160 118 Q200 175 240 118" fill="none" stroke="${stroke(c)}" stroke-width="4"/><path d="M150 330 h100 v45 h-100 z" fill="none" stroke="${stroke(c)}" stroke-width="3" opacity=".5"/>${art(200, 245, 90)}`,
  mug: (c, art) => `<rect x="95" y="120" width="180" height="210" rx="16" fill="${c}" stroke="${stroke(c)}" stroke-width="5"/><path d="M275 165 h28 a40 40 0 0 1 0 80 h-28" fill="none" stroke="${stroke(c)}" stroke-width="14"/><ellipse cx="185" cy="122" rx="90" ry="10" fill="${stroke(c)}" opacity=".25"/>${art(185, 225, 95)}`,
  cap: (c, art) => `<path d="M85 260 Q90 130 200 125 Q310 130 315 260 Z" fill="${c}" stroke="${stroke(c)}" stroke-width="5"/><path d="M85 258 Q60 300 210 300 Q345 300 315 258 Z" fill="${c}" stroke="${stroke(c)}" stroke-width="5"/><circle cx="200" cy="128" r="8" fill="${stroke(c)}"/>${art(200, 205, 65)}`,
  poster: (c, art) => `<rect x="105" y="60" width="190" height="270" fill="#fff" stroke="${stroke(c)}" stroke-width="${c === "#22212a" ? 14 : 5}"/><rect x="125" y="80" width="150" height="200" fill="#fdf3ee"/>${art(200, 180, 120)}<rect x="140" y="292" width="120" height="8" rx="4" fill="#2a2933" opacity=".6"/>`,
  tote: (c, art) => `<path d="M150 150 Q150 70 200 70 Q250 70 250 150" fill="none" stroke="${stroke(c)}" stroke-width="10"/><rect x="100" y="140" width="200" height="240" rx="6" fill="${c}" stroke="${stroke(c)}" stroke-width="5"/>${art(200, 255, 110)}`,
  sticker: (c, art) => `<circle cx="200" cy="220" r="125" fill="#fff" stroke="#d8d6d0" stroke-width="3"/><circle cx="200" cy="220" r="110" fill="${c}"/>${art(200, 220, 130)}`,
  phone: (c, art) => `<rect x="130" y="50" width="140" height="290" rx="28" fill="${c}" stroke="${stroke(c)}" stroke-width="5"/><rect x="150" y="70" width="40" height="55" rx="10" fill="${stroke(c)}" opacity=".85"/>${art(200, 230, 95)}`,
};

export const DEMO_IMAGES = [];

function write(type, color, artIndex, bgIndex) {
  const name = `${type}-${color}-${artIndex}.svg`;
  const c = COLORS[color];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" width="800" height="800">
<defs><radialGradient id="b" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="${BG[bgIndex % BG.length]}"/></radialGradient></defs>
<rect width="400" height="400" fill="url(#b)"/><ellipse cx="200" cy="430" rx="150" ry="22" fill="#000" opacity=".06"/>
${SHAPES[type](c, ARTS[artIndex % ARTS.length])}
</svg>`;
  writeFileSync(new URL(name, OUT), svg);
  DEMO_IMAGES.push(name);
}

const PLAN = {
  tshirt: ["white", "black", "navy", "red", "pink", "sky"],
  hoodie: ["grey", "black", "forest", "navy", "mustard"],
  mug: ["white", "black", "pink", "sky"],
  cap: ["black", "beige", "navy", "forest"],
  poster: ["white", "black"],
  tote: ["natural", "black", "mustard"],
  sticker: ["white", "sky", "pink", "mustard"],
  phone: ["black", "clear", "pink", "navy"],
};
let i = 0;
for (const [type, colors] of Object.entries(PLAN)) {
  colors.forEach((color, j) => {
    for (let art = 0; art < 3; art++) write(type, color, (art + j) % ARTS.length, i++);
  });
}
console.log(`wrote ${DEMO_IMAGES.length} images`);
