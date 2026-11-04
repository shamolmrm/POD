/**
 * Demo catalog so the store looks complete before Printify is connected.
 * Demo products use original illustrations (apps/web/public/demo), are marked isDemo,
 * cannot be added to the cart, and are removed with `remove-demo` / the admin button.
 */
import { type Prisma, PrismaClient } from "@prisma/client";
import sharp from "sharp";
import { StorageService } from "../modules/files/storage.service";

type Kind = "tshirt" | "hoodie" | "mug" | "cap" | "poster" | "tote" | "sticker" | "phone";

const CATEGORIES: Array<{ slug: string; name: string; kind: Kind; sort: number }> = [
  { slug: "t-shirts", name: "T-Shirts", kind: "tshirt", sort: 1 },
  { slug: "hoodies", name: "Hoodies", kind: "hoodie", sort: 2 },
  { slug: "mugs", name: "Mugs", kind: "mug", sort: 3 },
  { slug: "caps", name: "Caps", kind: "cap", sort: 4 },
  { slug: "posters", name: "Posters", kind: "poster", sort: 5 },
  { slug: "tote-bags", name: "Tote Bags", kind: "tote", sort: 6 },
  { slug: "stickers", name: "Stickers", kind: "sticker", sort: 7 },
  { slug: "phone-cases", name: "Phone Cases", kind: "phone", sort: 8 },
];

/** Print area sizes are typical for each product type (real ones come from Printify on import). */
const AREAS: Record<Kind, Array<{ position: string; w: number; h: number }>> = {
  tshirt: [
    { position: "front", w: 4500, h: 5100 },
    { position: "back", w: 4500, h: 5100 },
  ],
  hoodie: [
    { position: "front", w: 4500, h: 4800 },
    { position: "back", w: 4500, h: 5100 },
  ],
  mug: [{ position: "front", w: 2475, h: 1155 }],
  cap: [{ position: "front", w: 1500, h: 750 }],
  poster: [{ position: "front", w: 5400, h: 7200 }],
  tote: [{ position: "front", w: 3600, h: 3600 }],
  sticker: [{ position: "front", w: 1500, h: 1500 }],
  phone: [{ position: "front", w: 1200, h: 2400 }],
};

const COLORS: Record<Kind, string[]> = {
  tshirt: ["white", "black", "navy", "red", "pink", "sky"],
  hoodie: ["grey", "black", "forest", "navy", "mustard"],
  mug: ["white", "black", "pink", "sky"],
  cap: ["black", "beige", "navy", "forest"],
  poster: ["white", "black"],
  tote: ["natural", "black", "mustard"],
  sticker: ["white", "sky", "pink", "mustard"],
  phone: ["black", "clear", "pink", "navy"],
};

const SIZES: Record<Kind, string[]> = {
  tshirt: ["S", "M", "L", "XL", "2XL"],
  hoodie: ["S", "M", "L", "XL", "2XL"],
  mug: ["11 oz", "15 oz"],
  cap: ["One size"],
  poster: ['12″×16″', '18″×24″', '24″×36″'],
  tote: ["One size"],
  sticker: ['3″×3″', '4″×4″', '6″×6″'],
  phone: ["iPhone 15", "iPhone 15 Pro", "Galaxy S24", "Pixel 8"],
};

const PRODUCTS: Array<{ kind: Kind; title: string; description: string; price: number }> = [
  { kind: "tshirt", title: "Classic Unisex Tee", price: 2199, description: "Soft, everyday cotton tee with a relaxed unisex fit. Perfect for bold prints and photos." },
  { kind: "tshirt", title: "Heavyweight Cotton Tee", price: 2599, description: "Thick, durable cotton with a structured feel. Holds its shape wash after wash." },
  { kind: "tshirt", title: "Women's Fitted Tee", price: 2299, description: "Slim, flattering fit in lightweight cotton for an easy everyday look." },
  { kind: "hoodie", title: "Pullover Hoodie", price: 4299, description: "Cosy fleece-lined hoodie with kangaroo pocket and roomy hood." },
  { kind: "hoodie", title: "Zip-Up Hoodie", price: 4699, description: "Full-zip hoodie with soft brushed interior — layer it all year." },
  { kind: "hoodie", title: "Crewneck Sweatshirt", price: 3799, description: "Classic crewneck sweatshirt, warm and minimal." },
  { kind: "mug", title: "Ceramic Mug", price: 1499, description: "Glossy ceramic mug, dishwasher and microwave safe. Prints wrap around the side." },
  { kind: "mug", title: "Two-Tone Mug", price: 1699, description: "White mug with a coloured inside and handle for a playful pop." },
  { kind: "mug", title: "Travel Tumbler", price: 2499, description: "Insulated tumbler that keeps drinks hot or cold for hours." },
  { kind: "cap", title: "Dad Hat", price: 2199, description: "Low-profile cotton cap with an adjustable strap. Great for embroidered logos." },
  { kind: "cap", title: "Trucker Cap", price: 2299, description: "Breathable mesh back and a structured front panel for your design." },
  { kind: "cap", title: "Snapback Cap", price: 2499, description: "Flat-brim snapback with a bold, structured crown." },
  { kind: "poster", title: "Matte Poster", price: 1599, description: "Museum-quality matte paper with rich, true-to-life colours." },
  { kind: "poster", title: "Framed Poster", price: 4999, description: "Ready to hang — printed poster in a sleek wooden frame." },
  { kind: "poster", title: "Canvas Print", price: 5999, description: "Gallery-wrapped canvas, stretched over a solid wood frame." },
  { kind: "tote", title: "Cotton Tote Bag", price: 1799, description: "Lightweight everyday tote with long handles." },
  { kind: "tote", title: "Heavy Canvas Tote", price: 2499, description: "Sturdy canvas tote for groceries, books and beach days." },
  { kind: "tote", title: "Zip Tote Bag", price: 2799, description: "Roomy tote with a top zip to keep things secure." },
  { kind: "sticker", title: "Kiss-Cut Sticker", price: 399, description: "Vinyl sticker with a white border, easy to peel. Laptop-ready." },
  { kind: "sticker", title: "Die-Cut Sticker", price: 499, description: "Cut exactly to the shape of your design. Waterproof vinyl." },
  { kind: "sticker", title: "Sticker Sheet", price: 999, description: "A sheet of mini stickers — perfect for planners and gifts." },
  { kind: "phone", title: "Tough Phone Case", price: 2799, description: "Dual-layer protection with a glossy printed back." },
  { kind: "phone", title: "Slim Phone Case", price: 2199, description: "Lightweight one-piece case with a full-wrap print." },
  { kind: "phone", title: "Clear Phone Case", price: 1999, description: "Crystal-clear case that shows off your phone and your design." },
];

/** Ready-made designs: simple typographic artwork, rendered to a preview and stored as editor JSON. */
const DESIGNS: Array<{ name: string; kind: Kind; productIndex: number; lines: Array<{ text: string; color: string; size: number; font: string; weight?: string }>; dot?: string }> = [
  { name: "Good Vibes Only", kind: "tshirt", productIndex: 0, dot: "#ffcc33", lines: [{ text: "GOOD", color: "#ff5a36", size: 0.2, font: "Anton" }, { text: "VIBES ONLY", color: "#6d4aff", size: 0.12, font: "Anton" }] },
  { name: "Born to Explore", kind: "tshirt", productIndex: 1, dot: "#2f5d47", lines: [{ text: "BORN TO", color: "#22212a", size: 0.1, font: "Oswald" }, { text: "EXPLORE", color: "#2f5d47", size: 0.18, font: "Anton" }] },
  { name: "Dream Big", kind: "tshirt", productIndex: 2, dot: "#f2b8c6", lines: [{ text: "Dream", color: "#c8382f", size: 0.16, font: "Pacifico" }, { text: "BIG", color: "#22212a", size: 0.2, font: "Anton" }] },
  { name: "Stay Wild", kind: "hoodie", productIndex: 3, dot: "#2bb3a3", lines: [{ text: "STAY", color: "#2bb3a3", size: 0.14, font: "Bebas Neue" }, { text: "WILD", color: "#ff5a36", size: 0.22, font: "Bebas Neue" }] },
  { name: "Weekend Mode", kind: "hoodie", productIndex: 5, dot: "#ffcc33", lines: [{ text: "WEEKEND", color: "#6d4aff", size: 0.14, font: "Anton" }, { text: "mode: on", color: "#ff5a36", size: 0.1, font: "Permanent Marker" }] },
  { name: "Coffee First", kind: "mug", productIndex: 6, lines: [{ text: "But first,", color: "#6b4f3a", size: 0.16, font: "Dancing Script" }, { text: "COFFEE", color: "#22212a", size: 0.26, font: "Anton" }] },
  { name: "World's Best Dad", kind: "mug", productIndex: 7, lines: [{ text: "WORLD'S BEST", color: "#1f2b4d", size: 0.14, font: "Oswald" }, { text: "DAD", color: "#c8382f", size: 0.32, font: "Anton" }] },
  { name: "Hello Summer", kind: "tote", productIndex: 15, dot: "#ff7a45", lines: [{ text: "hello", color: "#ff5a36", size: 0.14, font: "Pacifico" }, { text: "SUMMER", color: "#2bb3a3", size: 0.16, font: "Anton" }] },
  { name: "Plant Lady", kind: "tote", productIndex: 16, dot: "#2f5d47", lines: [{ text: "PLANT", color: "#2f5d47", size: 0.16, font: "Anton" }, { text: "lady", color: "#c8382f", size: 0.14, font: "Pacifico" }] },
  { name: "Create Every Day", kind: "poster", productIndex: 12, dot: "#6d4aff", lines: [{ text: "CREATE", color: "#22212a", size: 0.12, font: "Anton" }, { text: "every", color: "#ff5a36", size: 0.08, font: "Pacifico" }, { text: "DAY", color: "#6d4aff", size: 0.14, font: "Anton" }] },
  { name: "Stay Curious", kind: "sticker", productIndex: 19, dot: "#ffcc33", lines: [{ text: "stay", color: "#6d4aff", size: 0.14, font: "Pacifico" }, { text: "CURIOUS", color: "#22212a", size: 0.15, font: "Anton" }] },
  { name: "Mama Bear", kind: "phone", productIndex: 21, dot: "#f2b8c6", lines: [{ text: "MAMA", color: "#c8382f", size: 0.1, font: "Anton" }, { text: "BEAR", color: "#22212a", size: 0.12, font: "Anton" }] },
];

const slug = (s: string) => `demo-${s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "")}`;
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Layout shared by the preview SVG and the editor objects, in print-area pixels. */
function layout(d: (typeof DESIGNS)[number], w: number, h: number) {
  const unit = Math.min(w, h);
  const total = d.lines.reduce((s, l) => s + l.size * unit * 1.15, 0);
  let y = h / 2 - total / 2;
  const lines = d.lines.map((l) => {
    const fontSize = Math.round(l.size * unit);
    y += fontSize * 1.15;
    return { ...l, fontSize, y: y - fontSize * 0.575 };
  });
  return { lines, dot: d.dot ? { r: unit * 0.42, x: w / 2, y: h / 2 } : null };
}

function previewSvg(d: (typeof DESIGNS)[number], w: number, h: number): string {
  const { lines, dot } = layout(d, w, h);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
${dot ? `<circle cx="${dot.x}" cy="${dot.y}" r="${dot.r}" fill="${d.dot}" opacity="0.35"/>` : ""}
${lines
  .map((l) => `<text x="${w / 2}" y="${l.y}" font-family="${esc(l.font)}, DejaVu Sans, sans-serif" font-size="${l.fontSize}" font-weight="bold" fill="${l.color}" text-anchor="middle" dominant-baseline="central">${esc(l.text)}</text>`)
  .join("\n")}
</svg>`;
}

function editorCanvas(d: (typeof DESIGNS)[number], w: number, h: number): Record<string, unknown> {
  const { lines, dot } = layout(d, w, h);
  const objects: Array<Record<string, unknown>> = [];
  if (dot) objects.push({ type: "Circle", version: "6.9.1", originX: "center", originY: "center", left: dot.x, top: dot.y, radius: dot.r, fill: d.dot, opacity: 0.35 });
  for (const l of lines) {
    objects.push({
      type: "Textbox",
      version: "6.9.1",
      originX: "center",
      originY: "center",
      left: w / 2,
      top: l.y,
      width: w * 0.95,
      text: l.text,
      fontSize: l.fontSize,
      fontFamily: l.font,
      fontWeight: "bold",
      fill: l.color,
      textAlign: "center",
    });
  }
  return { version: "6.9.1", objects };
}

export async function seedDemo(prisma: PrismaClient, storage: StorageService): Promise<string> {
  if (await prisma.product.count({ where: { isDemo: true } })) return "Demo data already exists (run remove-demo first to rebuild).";

  const cats = new Map<Kind, string>();
  for (const c of CATEGORIES) {
    const cat = await prisma.category.upsert({ where: { slug: c.slug }, create: { slug: c.slug, name: c.name, sort: c.sort }, update: {} });
    cats.set(c.kind, cat.id);
  }

  const products: Array<{ id: string; kind: Kind; areas: Array<{ position: string; w: number; h: number }> }> = [];
  let fakeVariant = 900_000;
  for (const [i, p] of PRODUCTS.entries()) {
    const colors = COLORS[p.kind];
    const shift = i % colors.length;
    const ordered = [...colors.slice(shift), ...colors.slice(0, shift)];
    const images = ordered.slice(0, 3).map((color, j) => imageFor(p.kind, color, i + j));
    const variants: Prisma.ProductVariantCreateWithoutProductInput[] = [];
    for (const color of ordered) {
      for (const [k, size] of SIZES[p.kind].entries()) {
        variants.push({
          printifyVariantId: fakeVariant++,
          title: SIZES[p.kind].length > 1 ? `${cap(color)} / ${size}` : cap(color),
          options: SIZES[p.kind].length > 1 ? { color: cap(color), size } : { color: cap(color) },
          costCents: 0,
          priceCents: p.price + k * (p.kind === "tshirt" || p.kind === "hoodie" ? (k >= 4 ? 200 : 0) : 300),
        });
      }
    }
    const created = await prisma.product.create({
      data: {
        slug: slug(p.title),
        title: p.title,
        description: `${p.description}\n\nDemo product — shown as an example while our catalog is being set up.`,
        status: "ACTIVE",
        isDemo: true,
        categoryId: cats.get(p.kind),
        printifyBlueprintId: -(i + 1),
        printifyProviderId: 0,
        images,
        variants: { create: variants },
        printAreas: { create: AREAS[p.kind].map((a) => ({ position: a.position, widthPx: a.w, heightPx: a.h })) },
      },
    });
    products.push({ id: created.id, kind: p.kind, areas: AREAS[p.kind] });
  }

  for (const d of DESIGNS) {
    const product = products[d.productIndex];
    const area = product.areas[0];
    const preview = await sharp(Buffer.from(previewSvg(d, area.w, area.h)))
      .resize({ width: 900, height: 900, fit: "inside" })
      .png()
      .toBuffer();
    const key = storage.newKey("previews", "png");
    await storage.save(key, preview);
    await prisma.design.create({
      data: {
        productId: product.id,
        name: d.name,
        isTemplate: true,
        versions: { create: { number: 1, previewKey: key, areas: { [area.position]: { canvas: editorCanvas(d, area.w, area.h), widthPx: area.w, heightPx: area.h } } as Prisma.InputJsonValue } },
      },
    });
  }
  return `Created ${CATEGORIES.length} categories, ${products.length} demo products and ${DESIGNS.length} ready-made designs.`;
}

export async function removeDemo(prisma: PrismaClient, storage?: StorageService): Promise<string> {
  const demo = await prisma.product.findMany({ where: { isDemo: true }, select: { id: true } });
  const ids = demo.map((p) => p.id);
  if (!ids.length) return "No demo data.";
  const versions = await prisma.designVersion.findMany({ where: { design: { productId: { in: ids } } }, select: { previewKey: true } });
  await prisma.$transaction([
    prisma.cartItem.deleteMany({ where: { variant: { productId: { in: ids } } } }),
    prisma.design.deleteMany({ where: { productId: { in: ids } } }),
    prisma.product.deleteMany({ where: { id: { in: ids } } }),
  ]);
  if (storage) for (const v of versions) if (v.previewKey) await storage.remove(v.previewKey);
  return `Removed ${ids.length} demo products and their designs.`;
}

const cap = (s: string) => s[0].toUpperCase() + s.slice(1);

/** Matches scripts/make-demo-images.mjs: colour #j of a kind has artworks j, j+1, j+2 (mod 6). */
function imageFor(kind: Kind, color: string, n: number): string {
  const j = COLORS[kind].indexOf(color);
  return `/demo/${kind}-${color}-${(j + (n % 3)) % 6}.svg`;
}
