"use client";
/* eslint-disable react-hooks/refs -- the canvas lives in refs; every change calls rerender() so the UI reads fresh values */

import { Canvas, FabricImage, type FabricObject, Textbox } from "fabric";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  Copy,
  Crosshair,
  ImagePlus,
  Italic,
  Redo2,
  Trash2,
  Type,
  Undo2,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Button, Label } from "@/components/ui";
import { api, errorText } from "@/lib/api";
import {
  type AreaSpec,
  type AreaState,
  areasForVariant,
  dpiLabel,
  effectiveDpi,
  findVariant,
  FONTS,
  FONTS_CSS,
  hasObjects,
  optionMatrix,
  POSITION_LABEL,
  refitCanvas,
  type Variant,
} from "@/lib/editor";
import { cn, money } from "@/lib/utils";

export type EditorProduct = {
  id: string;
  slug: string;
  title: string;
  images: string[];
  currency: string;
  variants: Variant[];
  printAreas: AreaSpec[];
};

type Saved = { id: string; versionId: string; number: number };
type Selected = { kind: "text" | "image" | "other"; obj: FabricObject } | null;
const CUSTOM_PROPS = ["assetId"];
const HISTORY_LIMIT = 50;

function serialize(c: Canvas): Record<string, unknown> {
  return c.toObject(CUSTOM_PROPS) as Record<string, unknown>;
}

/** Refresh signed image URLs (they expire) before loading a saved canvas. */
async function withFreshUrls(json: Record<string, unknown>): Promise<Record<string, unknown>> {
  const objects = (json.objects as Array<Record<string, unknown>>) ?? [];
  const fresh = await Promise.all(
    objects.map(async (o) => {
      if (o.type?.toString().toLowerCase() === "image" && typeof o.assetId === "string") {
        try {
          const a = await api<{ url: string }>(`/assets/${o.assetId}`);
          return { ...o, src: a.url };
        } catch {
          return o;
        }
      }
      return o;
    }),
  );
  return { ...json, objects: fresh };
}

export function DesignEditor({ product, designId }: { product: EditorProduct; designId?: string }) {
  const router = useRouter();
  const canvasEl = useRef<HTMLCanvasElement>(null);
  const wrapEl = useRef<HTMLDivElement>(null);
  const fileEl = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const areaStates = useRef<Record<string, AreaState>>({});
  const history = useRef<{ stack: string[]; index: number; muted: boolean }>({ stack: [], index: -1, muted: false });

  const options = useMemo(() => optionMatrix(product.variants), [product.variants]);
  const [picked, setPicked] = useState<Record<string, string>>(() => ({ ...(product.variants[0]?.options ?? {}) }));
  const variant = findVariant(product.variants, picked) ?? product.variants[0];
  const areas = useMemo(() => areasForVariant(product.printAreas, variant.printifyVariantId), [product.printAreas, variant.printifyVariantId]);
  const [position, setPosition] = useState<string>(areas[0]?.position ?? "front");
  const area = areas.find((a) => a.position === position) ?? areas[0];

  const [selected, setSelected] = useState<Selected>(null);
  const [, setTick] = useState(0);
  const rerender = () => setTick((t) => t + 1);
  const [saved, setSaved] = useState<Saved | null>(null);
  const [name, setName] = useState("My design");
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: "error" | "success" | "info"; text: string } | null>(null);
  const [qty, setQty] = useState(1);
  const [display, setDisplay] = useState(480);
  const [preview, setPreview] = useState<string | null>(null);

  // fonts
  useEffect(() => {
    if (document.getElementById("editor-fonts")) return;
    const link = document.createElement("link");
    link.id = "editor-fonts";
    link.rel = "stylesheet";
    link.href = FONTS_CSS;
    document.head.appendChild(link);
  }, []);

  // responsive canvas width
  useEffect(() => {
    const el = wrapEl.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setDisplay(Math.max(260, Math.min(560, Math.floor(e.contentRect.width)))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const pushHistory = useCallback(() => {
    const c = canvasRef.current;
    const h = history.current;
    if (!c || h.muted) return;
    h.stack = h.stack.slice(0, h.index + 1);
    h.stack.push(JSON.stringify(serialize(c)));
    if (h.stack.length > HISTORY_LIMIT) h.stack.shift();
    h.index = h.stack.length - 1;
    rerender();
  }, []);

  // create the Fabric canvas once
  useEffect(() => {
    if (!canvasEl.current) return;
    const c = new Canvas(canvasEl.current, { preserveObjectStacking: true, selection: true });
    canvasRef.current = c;
    const onSelect = () => {
      const obj = c.getActiveObject();
      if (!obj) return setSelected(null);
      const t = obj.type?.toLowerCase();
      setSelected({ kind: t === "textbox" || t === "i-text" ? "text" : t === "image" ? "image" : "other", obj });
    };
    c.on("selection:created", onSelect);
    c.on("selection:updated", onSelect);
    c.on("selection:cleared", () => setSelected(null));
    c.on("object:modified", () => {
      pushHistory();
      rerender();
    });
    c.on("object:scaling", rerender);
    return () => {
      void c.dispose();
      canvasRef.current = null;
    };
  }, [pushHistory]);

  /** Show the current print area on the canvas (stash the previous one first). */
  const loadArea = useCallback(
    async (skipStash = false, prev?: { position: string; area: AreaSpec }) => {
      const c = canvasRef.current;
      if (!c || !area) return;
      if (!skipStash && prev) areaStates.current[prev.position] = { canvas: serialize(c), widthPx: prev.area.widthPx, heightPx: prev.area.heightPx };
      const zoom = display / area.widthPx;
      c.setDimensions({ width: display, height: Math.round(area.heightPx * zoom) });
      c.setZoom(zoom);
      history.current = { stack: [], index: -1, muted: true };
      c.clear();
      const state = areaStates.current[area.position];
      if (state && hasObjects(state.canvas)) {
        const fitted = refitCanvas(state.canvas, { w: state.widthPx, h: state.heightPx }, { w: area.widthPx, h: area.heightPx });
        await c.loadFromJSON(await withFreshUrls(fitted));
        areaStates.current[area.position] = { canvas: fitted, widthPx: area.widthPx, heightPx: area.heightPx };
      }
      c.renderAll();
      history.current.muted = false;
      pushHistory();
      setSelected(null);
    },
    [area, display, pushHistory],
  );

  // load an existing design
  useEffect(() => {
    if (!designId) return;
    api<{ id: string; name: string; version: { id: string; number: number; areas: Record<string, AreaState> } | null }>(`/designs/${designId}`)
      .then((d) => {
        setName(d.name);
        if (d.version) {
          areaStates.current = d.version.areas;
          setSaved({ id: d.id, versionId: d.version.id, number: d.version.number });
          setTick((t) => t + 1);
          void loadArea(true);
        }
      })
      .catch(() => setMsg({ tone: "error", text: "Could not open this design." }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [designId]);

  // switch area / variant / size
  const shown = useRef<{ position: string; area: AreaSpec } | null>(null);
  useEffect(() => {
    if (!area) return;
    const prev = shown.current;
    shown.current = { position: area.position, area };
    void loadArea(!prev, prev ?? undefined);
  }, [area, display, loadArea]);

  function stash() {
    const c = canvasRef.current;
    if (c && area) areaStates.current[area.position] = { canvas: serialize(c), widthPx: area.widthPx, heightPx: area.heightPx };
  }

  // ── actions ──

  function center(obj: FabricObject) {
    if (!area) return;
    obj.set({ originX: "center", originY: "center", left: area.widthPx / 2, top: area.heightPx / 2 });
    obj.setCoords();
  }

  function addText() {
    const c = canvasRef.current;
    if (!c || !area) return;
    const t = new Textbox("Your text", {
      fontFamily: "Anton",
      fontSize: Math.round(area.widthPx * 0.1),
      fill: "#111111",
      textAlign: "center",
      width: area.widthPx * 0.7,
    });
    center(t);
    c.add(t);
    c.setActiveObject(t);
    pushHistory();
  }

  async function addImage(file: File) {
    const c = canvasRef.current;
    if (!c || !area) return;
    setBusy("upload");
    setMsg(null);
    try {
      const body = new FormData();
      body.append("file", file);
      const asset = await api<{ id: string; url: string; widthPx: number; heightPx: number }>("/assets", { method: "POST", body });
      const img = await FabricImage.fromURL(asset.url, { crossOrigin: "anonymous" });
      img.set({ assetId: asset.id } as Partial<FabricImage>);
      // fit inside 80% of the area, but never upscale beyond what keeps ~150 DPI
      const fit = Math.min((area.widthPx * 0.8) / asset.widthPx, (area.heightPx * 0.8) / asset.heightPx);
      img.scale(fit);
      center(img);
      c.add(img);
      c.setActiveObject(img);
      pushHistory();
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err, "Upload failed.") });
    } finally {
      setBusy(null);
    }
  }

  function update(props: Record<string, unknown>) {
    const c = canvasRef.current;
    const obj = c?.getActiveObject();
    if (!c || !obj) return;
    obj.set(props);
    obj.setCoords();
    c.requestRenderAll();
    pushHistory();
    rerender();
  }

  function remove() {
    const c = canvasRef.current;
    if (!c) return;
    c.getActiveObjects().forEach((o) => c.remove(o));
    c.discardActiveObject();
    c.requestRenderAll();
    pushHistory();
  }

  async function duplicate() {
    const c = canvasRef.current;
    const obj = c?.getActiveObject();
    if (!c || !obj) return;
    const copy = await obj.clone(CUSTOM_PROPS);
    copy.set({ left: (obj.left ?? 0) + 60, top: (obj.top ?? 0) + 60 });
    c.add(copy);
    c.setActiveObject(copy);
    pushHistory();
  }

  function layer(dir: "up" | "down") {
    const c = canvasRef.current;
    const obj = c?.getActiveObject();
    if (!c || !obj) return;
    if (dir === "up") c.bringObjectForward(obj);
    else c.sendObjectBackwards(obj);
    c.requestRenderAll();
    pushHistory();
  }

  async function undoRedo(step: -1 | 1) {
    const c = canvasRef.current;
    const h = history.current;
    const next = h.index + step;
    if (!c || next < 0 || next >= h.stack.length) return;
    h.muted = true;
    await c.loadFromJSON(JSON.parse(h.stack[next]));
    c.renderAll();
    h.index = next;
    h.muted = false;
    setSelected(null);
    rerender();
  }

  // keyboard: delete, undo/redo
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = canvasRef.current;
      const editing = (c?.getActiveObject() as Textbox | undefined)?.isEditing;
      if (editing || (e.target as HTMLElement).closest("input,textarea,select")) return;
      if (e.key === "Delete" || e.key === "Backspace") remove();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") void undoRedo(e.shiftKey ? 1 : -1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  // ── save / export ──

  function designAreas(): Record<string, AreaState> {
    stash();
    const out: Record<string, AreaState> = {};
    const valid = new Set(areas.map((a) => `${a.position}|${a.widthPx}|${a.heightPx}`));
    for (const [pos, st] of Object.entries(areaStates.current)) {
      if (hasObjects(st.canvas) && valid.has(`${pos}|${st.widthPx}|${st.heightPx}`)) out[pos] = st;
    }
    return out;
  }

  async function save(): Promise<Saved | null> {
    const areasOut = designAreas();
    if (!Object.keys(areasOut).length) {
      setMsg({ tone: "info", text: "Add some text or an image first." });
      return null;
    }
    const s = saved
      ? await api<Saved>(`/designs/${saved.id}/versions`, { method: "POST", body: JSON.stringify({ areas: areasOut, name }) })
      : await api<Saved>("/designs", { method: "POST", body: JSON.stringify({ productId: product.id, name, areas: areasOut }) });
    setSaved(s);
    if (!saved) router.replace(`/design/${product.slug}?d=${s.id}`, { scroll: false });
    return s;
  }

  /** Render one area at full print size on an off-screen canvas and upload it. */
  async function renderArea(s: Saved, pos: string, st: AreaState, isPreview = false): Promise<string | undefined> {
    const el = document.createElement("canvas");
    const off = new Canvas(el, { enableRetinaScaling: false });
    try {
      await document.fonts.ready;
      const scale = isPreview ? Math.min(1, 1200 / st.widthPx) : 1;
      off.setDimensions({ width: Math.round(st.widthPx * scale), height: Math.round(st.heightPx * scale) });
      off.setZoom(scale);
      await off.loadFromJSON(await withFreshUrls(st.canvas));
      if (isPreview) off.backgroundColor = "#f4f3ef";
      off.renderAll();
      const blob = await new Promise<Blob | null>((r) => off.toCanvasElement(1).toBlob(r, "image/png"));
      if (!blob) throw new Error("render failed");
      const body = new FormData();
      body.append("position", isPreview ? "__preview" : pos);
      body.append("file", blob, `${pos}.png`);
      await api(`/designs/${s.id}/versions/${s.versionId}/files`, { method: "POST", body });
      return isPreview ? URL.createObjectURL(blob) : undefined;
    } finally {
      void off.dispose();
    }
  }

  async function onSave() {
    setBusy("save");
    setMsg(null);
    try {
      const s = await save();
      if (s) {
        const first = Object.entries(designAreas())[0];
        if (first) setPreview((await renderArea(s, first[0], first[1], true)) ?? null);
        setMsg({ tone: "success", text: "Design saved." });
      }
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  async function addToCart() {
    setBusy("cart");
    setMsg(null);
    try {
      const lowDpi = imageObjects().some((o) => dpiOf(o) < 100);
      if (lowDpi && !window.confirm("Some images are low resolution and may print blurry. Add to cart anyway?")) return;
      const s = await save();
      if (!s) return;
      const areasOut = designAreas();
      for (const [pos, st] of Object.entries(areasOut)) await renderArea(s, pos, st);
      const first = Object.entries(areasOut)[0];
      if (first) await renderArea(s, first[0], first[1], true);
      await api("/cart/items", { method: "POST", body: JSON.stringify({ variantId: variant.id, designVersionId: s.versionId, quantity: qty }) });
      router.push("/cart");
    } catch (err) {
      setMsg({ tone: "error", text: errorText(err) });
    } finally {
      setBusy(null);
    }
  }

  // ── derived UI state ──

  function imageObjects(): FabricImage[] {
    return (canvasRef.current?.getObjects() ?? []).filter((o) => o.type?.toLowerCase() === "image") as FabricImage[];
  }
  function dpiOf(o: FabricImage): number {
    const el = o.getElement() as HTMLImageElement;
    return effectiveDpi(el.naturalWidth || o.width, o.getScaledWidth());
  }

  const sel = selected?.obj as (FabricObject & Partial<Textbox>) | undefined;
  const selDpi = selected?.kind === "image" ? dpiLabel(dpiOf(selected.obj as FabricImage)) : null;
  const canUndo = history.current.index > 0;
  const canRedo = history.current.index < history.current.stack.length - 1;

  if (!area) return <Alert tone="error">This product has no printable areas.</Alert>;

  return (
    <div className="grid gap-6 lg:grid-cols-[220px_1fr_280px]">
      {/* tools */}
      <aside className="order-2 grid content-start gap-2 lg:order-1">
        <Button variant="outline" onClick={addText}>
          <Type className="h-4 w-4" /> Add text
        </Button>
        <Button variant="outline" onClick={() => fileEl.current?.click()} disabled={busy === "upload"}>
          <ImagePlus className="h-4 w-4" /> {busy === "upload" ? "Uploading…" : "Upload image"}
        </Button>
        <input
          ref={fileEl}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void addImage(f);
            e.target.value = "";
          }}
        />
        <p className="text-xs text-muted">PNG with a transparent background looks best. Use high-resolution images (at least 2000 px wide for a full front).</p>
        <div className="mt-4 flex gap-1">
          <Button variant="ghost" size="icon" onClick={() => undoRedo(-1)} disabled={!canUndo} aria-label="Undo">
            <Undo2 className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" onClick={() => undoRedo(1)} disabled={!canRedo} aria-label="Redo">
            <Redo2 className="h-4 w-4" />
          </Button>
        </div>
      </aside>

      {/* canvas */}
      <section className="order-1 lg:order-2">
        {areas.length > 1 && (
          <div role="tablist" aria-label="Print areas" className="mb-3 flex flex-wrap gap-1">
            {areas.map((a) => (
              <button
                key={a.position}
                role="tab"
                aria-selected={a.position === area.position}
                onClick={() => setPosition(a.position)}
                className={cn("rounded-full border border-line px-3 py-1 text-sm", a.position === area.position && "bg-fg text-bg")}
              >
                {POSITION_LABEL[a.position] ?? a.position}
                {hasObjects(areaStates.current[a.position]?.canvas) && " •"}
              </button>
            ))}
          </div>
        )}
        <div ref={wrapEl} className="w-full">
          <div className="relative mx-auto w-fit rounded-xl bg-[repeating-conic-gradient(#e9e7e1_0%_25%,#f6f5f1_0%_50%)] bg-[length:20px_20px] shadow-inner dark:bg-[repeating-conic-gradient(#24222b_0%_25%,#1b1a21_0%_50%)]">
            <canvas ref={canvasEl} />
            {/* print area outline + safe zone (not part of the export) */}
            <div className="pointer-events-none absolute inset-0 rounded-xl border-2 border-dashed border-accent/60" />
            <div className="pointer-events-none absolute inset-[5%] rounded-lg border border-dashed border-muted/40" />
          </div>
        </div>
        <p className="mt-2 text-center text-xs text-muted">
          Print area {area.widthPx}×{area.heightPx}px · dashed inner line = safe zone · drag corners to resize
        </p>
        {preview && (
          <div className="mt-4 text-center">
            <p className="mb-2 text-xs text-muted">Preview of your design on the product</p>
            <div className="relative mx-auto aspect-square w-64 overflow-hidden rounded-xl border border-line bg-fg/5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              {product.images[0] && <img src={product.images[0]} alt="" className="absolute inset-0 h-full w-full object-cover" />}
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview} alt="Your design" className="absolute left-1/2 top-[22%] w-[38%] -translate-x-1/2 mix-blend-multiply" />
            </div>
          </div>
        )}
      </section>

      {/* properties + order */}
      <aside className="order-3 grid content-start gap-4">
        {msg && <Alert tone={msg.tone}>{msg.text}</Alert>}
        {sel && (
          <div className="rounded-xl border border-line p-3">
            <div className="mb-3 flex flex-wrap gap-1">
              <Button size="icon" variant="ghost" onClick={() => sel && (center(sel), canvasRef.current?.requestRenderAll(), pushHistory())} aria-label="Center">
                <Crosshair className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => layer("up")} aria-label="Bring forward">
                <ArrowUp className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={() => layer("down")} aria-label="Send backward">
                <ArrowDown className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={duplicate} aria-label="Duplicate">
                <Copy className="h-4 w-4" />
              </Button>
              <Button size="icon" variant="ghost" onClick={remove} aria-label="Delete" className="text-red-600">
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
            {selected?.kind === "text" && (
              <div className="grid gap-3 text-sm">
                <div>
                  <Label htmlFor="font">Font</Label>
                  <select
                    id="font"
                    value={String(sel.fontFamily)}
                    onChange={(e) => update({ fontFamily: e.target.value })}
                    className="h-9 w-full rounded-lg border border-line bg-bg px-2"
                  >
                    {FONTS.map((f) => (
                      <option key={f} value={f} style={{ fontFamily: f }}>
                        {f}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor="color" className="mb-0">
                    Color
                  </Label>
                  <input id="color" type="color" value={String(sel.fill ?? "#111111")} onChange={(e) => update({ fill: e.target.value })} className="h-8 w-12 rounded" />
                </div>
                <div className="flex gap-1">
                  <Button size="icon" variant={sel.fontWeight === "bold" ? "default" : "ghost"} onClick={() => update({ fontWeight: sel.fontWeight === "bold" ? "normal" : "bold" })} aria-label="Bold">
                    <Bold className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant={sel.fontStyle === "italic" ? "default" : "ghost"} onClick={() => update({ fontStyle: sel.fontStyle === "italic" ? "normal" : "italic" })} aria-label="Italic">
                    <Italic className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => update({ textAlign: "left" })} aria-label="Align left">
                    <AlignLeft className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => update({ textAlign: "center" })} aria-label="Align center">
                    <AlignCenter className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="ghost" onClick={() => update({ textAlign: "right" })} aria-label="Align right">
                    <AlignRight className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted">Double-click the text on the canvas to edit it.</p>
              </div>
            )}
            {selDpi && (
              <p className={cn("text-xs", selDpi.tone === "good" ? "text-emerald-600" : selDpi.tone === "ok" ? "text-amber-600" : "text-red-600")}>{selDpi.text}</p>
            )}
            <div className="mt-3">
              <Label htmlFor="opacity">Opacity</Label>
              <input id="opacity" type="range" min="0.1" max="1" step="0.05" value={sel.opacity ?? 1} onChange={(e) => update({ opacity: Number(e.target.value) })} className="w-full" />
            </div>
          </div>
        )}

        <div className="grid gap-3 rounded-xl border border-line p-3 text-sm">
          {options.map((o) => (
            <div key={o.name}>
              <Label htmlFor={`opt-${o.name}`} className="capitalize">
                {o.name}
              </Label>
              <select
                id={`opt-${o.name}`}
                value={picked[o.name] ?? ""}
                onChange={(e) => {
                  stash();
                  setPicked((p) => ({ ...p, [o.name]: e.target.value }));
                }}
                className="h-9 w-full rounded-lg border border-line bg-bg px-2"
              >
                {o.values.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
          ))}
          {!findVariant(product.variants, picked) && <p className="text-xs text-red-600">This combination is not available.</p>}
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold">{money(variant.priceCents, product.currency)}</span>
            <label className="flex items-center gap-2">
              Qty
              <input type="number" min={1} max={50} value={qty} onChange={(e) => setQty(Math.max(1, Math.min(50, Number(e.target.value) || 1)))} className="h-9 w-16 rounded-lg border border-line bg-bg px-2" />
            </label>
          </div>
          <div>
            <Label htmlFor="dname">Design name</Label>
            <input id="dname" value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="h-9 w-full rounded-lg border border-line bg-bg px-2" />
          </div>
          <Button variant="outline" onClick={onSave} disabled={!!busy}>
            {busy === "save" ? "Saving…" : "Save design"}
          </Button>
          <Button variant="accent" size="lg" onClick={addToCart} disabled={!!busy || !findVariant(product.variants, picked)}>
            {busy === "cart" ? "Preparing print files…" : "Add to cart"}
          </Button>
          {saved && <p className="text-center text-xs text-muted">Saved · version {saved.number}</p>}
        </div>
      </aside>
    </div>
  );
}
