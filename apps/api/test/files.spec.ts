import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { checkPrintFile, processUpload } from "../src/modules/designs/images";
import { StorageService } from "../src/modules/files/storage.service";

const config = { env: "test", port: 0, databaseUrl: "x", redisUrl: "x", publicBaseUrl: "https://pod.example.com" };

const png = (w: number, h: number) =>
  sharp({ create: { width: w, height: h, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } } }).png().toBuffer();

describe("processUpload", () => {
  it("accepts a PNG and keeps transparency", async () => {
    const out = await processUpload(await png(300, 200));
    expect(out).toMatchObject({ ext: "png", mime: "image/png", width: 300, height: 200 });
    expect(out.sha256).toHaveLength(64);
  });

  it("re-encodes JPEG and applies EXIF rotation", async () => {
    // orientation 6 = rotate 90°: a 300x200 photo should come out 200x300
    const jpg = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#0a0" } })
      .jpeg()
      .withMetadata({ orientation: 6 })
      .toBuffer();
    const out = await processUpload(jpg);
    expect(out).toMatchObject({ ext: "jpg", width: 200, height: 300 });
    expect((await sharp(out.data).metadata()).orientation).toBeUndefined(); // metadata stripped
  });

  it("rejects non-images and tiny images", async () => {
    await expect(processUpload(Buffer.from("<svg onload=alert(1)>"))).rejects.toThrow(/not a supported image/);
    await expect(processUpload(await png(20, 20))).rejects.toThrow(/too small/);
  });
});

describe("checkPrintFile", () => {
  it("requires the exact print-area size", async () => {
    await expect(checkPrintFile(await png(400, 500), 400, 500)).resolves.toBeUndefined();
    await expect(checkPrintFile(await png(400, 499), 400, 500)).rejects.toThrow(/exactly 400×500px/);
  });
});

describe("StorageService", () => {
  process.env.FILES_DIR = mkdtempSync(join(tmpdir(), "pod-files-"));
  const storage = new StorageService(config);

  it("stores and reads files under validated keys only", async () => {
    const key = storage.newKey("uploads", "png");
    await storage.save(key, Buffer.from("hello"));
    expect((await storage.read(key)).toString()).toBe("hello");
    expect(() => storage.read("../../etc/passwd")).toThrow(/invalid storage key/);
  });

  it("signs URLs that expire and cannot be reused for another key", () => {
    const key = storage.newKey("renders", "png");
    const url = new URL(storage.signedUrl(key, 60), "https://x");
    const exp = url.searchParams.get("exp")!;
    const sig = url.searchParams.get("sig")!;
    expect(storage.verify(key, exp, sig)).toBe(true);
    expect(storage.verify(storage.newKey("renders", "png"), exp, sig)).toBe(false);
    expect(storage.verify(key, String(Number(exp) + 1), sig)).toBe(false);
    expect(storage.verify(key, "1", sig)).toBe(false); // expired
  });
});
