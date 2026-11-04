/** Pure helpers for the design editor (no Fabric import, so they are easy to test and reuse). */

export type AreaSpec = { position: string; widthPx: number; heightPx: number; variantIds: number[] };
export type AreaState = { canvas: Record<string, unknown>; widthPx: number; heightPx: number };
export type Variant = { id: string; printifyVariantId: number; title: string; options: Record<string, string>; priceCents: number };

/** Printify print-area pixel sizes are prepared at 300 DPI. */
export const AREA_DPI = 300;
export const DPI_GOOD = 200;
export const DPI_MIN = 150;

/** Effective print DPI of an image object: its natural pixels spread over its printed size. */
export function effectiveDpi(naturalWidth: number, renderedWidthPx: number): number {
  if (renderedWidthPx <= 0) return 0;
  return Math.round((AREA_DPI * naturalWidth) / renderedWidthPx);
}

export function dpiLabel(dpi: number): { text: string; tone: "good" | "ok" | "low" } {
  if (dpi >= DPI_GOOD) return { text: `Great print quality (${dpi} DPI)`, tone: "good" };
  if (dpi >= DPI_MIN) return { text: `OK print quality (${dpi} DPI)`, tone: "ok" };
  return { text: `Low resolution (${dpi} DPI) — may print blurry. Make it smaller or use a bigger image.`, tone: "low" };
}

/** Print areas available for a Printify variant (largest wins if a position is listed twice). */
export function areasForVariant(areas: AreaSpec[], printifyVariantId: number): AreaSpec[] {
  const byPos = new Map<string, AreaSpec>();
  for (const a of areas) {
    if (a.variantIds.length && !a.variantIds.includes(printifyVariantId)) continue;
    const prev = byPos.get(a.position);
    if (!prev || a.widthPx * a.heightPx > prev.widthPx * prev.heightPx) byPos.set(a.position, a);
  }
  const order = ["front", "back", "left_sleeve", "right_sleeve", "neck"];
  return [...byPos.values()].sort((x, y) => (order.indexOf(x.position) + 1 || 99) - (order.indexOf(y.position) + 1 || 99));
}

/**
 * Re-fit a saved canvas to a print area of another size (e.g. 3XL has a bigger area than S):
 * scale uniformly and keep the layout centred.
 */
export function refitCanvas(canvas: Record<string, unknown>, from: { w: number; h: number }, to: { w: number; h: number }): Record<string, unknown> {
  if (from.w === to.w && from.h === to.h) return canvas;
  const s = Math.min(to.w / from.w, to.h / from.h);
  const dx = (to.w - from.w * s) / 2;
  const dy = (to.h - from.h * s) / 2;
  const objects = ((canvas.objects as Array<Record<string, number>>) ?? []).map((o) => ({
    ...o,
    left: (o.left ?? 0) * s + dx,
    top: (o.top ?? 0) * s + dy,
    scaleX: (o.scaleX ?? 1) * s,
    scaleY: (o.scaleY ?? 1) * s,
  }));
  return { ...canvas, objects };
}

export function hasObjects(canvas: Record<string, unknown> | undefined): boolean {
  return Array.isArray(canvas?.objects) && (canvas.objects as unknown[]).length > 0;
}

/** Option names/values across variants, e.g. color: [Black, White], size: [S, M, L]. */
export function optionMatrix(variants: Variant[]): Array<{ name: string; values: string[] }> {
  const map = new Map<string, string[]>();
  for (const v of variants)
    for (const [k, val] of Object.entries(v.options ?? {})) {
      const list = map.get(k) ?? [];
      if (!list.includes(val)) list.push(val);
      map.set(k, list);
    }
  return [...map.entries()].map(([name, values]) => ({ name, values }));
}

export function findVariant(variants: Variant[], picked: Record<string, string>): Variant | undefined {
  return variants.find((v) => Object.entries(picked).every(([k, val]) => v.options?.[k] === val));
}

export const POSITION_LABEL: Record<string, string> = {
  front: "Front",
  back: "Back",
  left_sleeve: "Left sleeve",
  right_sleeve: "Right sleeve",
  neck: "Neck label",
};

/** OFL-licensed Google Fonts offered in the editor. */
export const FONTS = ["Inter", "Bebas Neue", "Anton", "Pacifico", "Lobster", "Playfair Display", "Roboto Slab", "Permanent Marker", "Dancing Script", "Oswald"];
export const FONTS_CSS = `https://fonts.googleapis.com/css2?${FONTS.map((f) => `family=${f.replace(/ /g, "+")}:wght@400;700`)
  .join("&")
  .replace(/(Bebas\+Neue|Anton|Pacifico|Lobster|Permanent\+Marker):wght@400;700/g, "$1")}&display=swap`;
