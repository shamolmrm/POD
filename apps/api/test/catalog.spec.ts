import { createHmac } from "node:crypto";
import { buildPrintAreas, slugify, stripHtml } from "../src/modules/catalog/catalog.service";
import { verifyPrintifySignature } from "../src/modules/printify/printify.client";

describe("buildPrintAreas", () => {
  it("groups placeholders by position and size, keeping variant ids", () => {
    const areas = buildPrintAreas([
      { id: 1, title: "S", options: {}, placeholders: [{ position: "front", width: 3153, height: 3995 }, { position: "back", width: 3153, height: 3995 }] },
      { id: 2, title: "M", options: {}, placeholders: [{ position: "front", width: 3153, height: 3995 }] },
      { id: 3, title: "3XL", options: {}, placeholders: [{ position: "front", width: 3600, height: 4500 }] },
    ]);
    expect(areas).toEqual([
      { position: "front", widthPx: 3153, heightPx: 3995, variantIds: [1, 2] },
      { position: "back", widthPx: 3153, heightPx: 3995, variantIds: [1] },
      { position: "front", widthPx: 3600, heightPx: 4500, variantIds: [3] },
    ]);
  });
});

describe("text helpers", () => {
  it("slugify", () => {
    expect(slugify("Unisex Heavy Cotton Tee™ (Gildan 5000)")).toBe("unisex-heavy-cotton-tee-gildan-5000");
    expect(slugify("!!!")).toBe("product");
  });

  it("stripHtml keeps line breaks and drops tags", () => {
    expect(stripHtml("<p>Soft &amp; durable</p><ul><li>100% cotton</li></ul>")).toBe("Soft & durable\n100% cotton");
  });
});

describe("verifyPrintifySignature", () => {
  const body = Buffer.from('{"id":"e1","type":"order:updated"}');
  const sig = "sha256=" + createHmac("sha256", "s3cret").update(body).digest("hex");

  it("accepts the right signature only", () => {
    expect(verifyPrintifySignature(body, sig, "s3cret")).toBe(true);
    expect(verifyPrintifySignature(body, sig, "other")).toBe(false);
    expect(verifyPrintifySignature(Buffer.from("{}"), sig, "s3cret")).toBe(false);
    expect(verifyPrintifySignature(body, undefined, "s3cret")).toBe(false);
    expect(verifyPrintifySignature(body, sig, "")).toBe(false);
  });
});
