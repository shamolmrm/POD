import { Inject, Injectable } from "@nestjs/common";
import { createHmac, randomUUID } from "node:crypto";
import { mkdir, readFile, rename, stat, unlink, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { CONFIG, type Config } from "../../config";
import { safeEqual } from "../auth/tokens";

const KEY = /^(uploads|renders|previews)\/\d{4}\/[0-9a-f-]{36}\.(png|jpg|webp)$/;

/**
 * Private file storage on the server's data volume. Files are reachable only through short-lived
 * HMAC-signed URLs (`/api/v1/files/<key>?exp=…&sig=…`), which is also how Printify fetches print files.
 * The interface (save / read / signedUrl) is what a Cloudflare R2 adapter will implement later.
 */
@Injectable()
export class StorageService {
  private readonly root = resolve(process.env.FILES_DIR ?? "./data/files");
  private readonly secret = process.env.FILES_SIGNING_KEY ?? "dev-only-signing-key";

  constructor(@Inject(CONFIG) private readonly config: Config) {
    if (config.env === "production" && !process.env.FILES_SIGNING_KEY) {
      throw new Error("FILES_SIGNING_KEY must be set in production");
    }
  }

  newKey(kind: "uploads" | "renders" | "previews", ext: "png" | "jpg" | "webp"): string {
    return `${kind}/${new Date().getUTCFullYear()}/${randomUUID()}.${ext}`;
  }

  static validKey(key: string): boolean {
    return KEY.test(key);
  }

  private path(key: string): string {
    if (!StorageService.validKey(key)) throw new Error("invalid storage key");
    return join(this.root, key);
  }

  async save(key: string, data: Buffer): Promise<void> {
    const file = this.path(key);
    await mkdir(dirname(file), { recursive: true, mode: 0o700 });
    const tmp = `${file}.tmp-${process.pid}`;
    await writeFile(tmp, data, { mode: 0o600 });
    await rename(tmp, file); // atomic: readers never see half a file
  }

  read(key: string): Promise<Buffer> {
    return readFile(this.path(key));
  }

  async exists(key: string): Promise<boolean> {
    return stat(this.path(key)).then(
      () => true,
      () => false,
    );
  }

  async remove(key: string): Promise<void> {
    await unlink(this.path(key)).catch(() => undefined);
  }

  /** Absolute signed URL valid for `seconds` (default 1 h). */
  signedUrl(key: string, seconds = 3600, absolute = false): string {
    const exp = Math.floor(Date.now() / 1000) + seconds;
    const path = `/api/v1/files/${key}?exp=${exp}&sig=${this.sign(key, exp)}`;
    return absolute ? `${this.config.publicBaseUrl}${path}` : path;
  }

  verify(key: string, exp: string, sig: string): boolean {
    const n = Number(exp);
    if (!StorageService.validKey(key) || !Number.isInteger(n) || n < Date.now() / 1000) return false;
    return safeEqual(sig, this.sign(key, n));
  }

  private sign(key: string, exp: number): string {
    return createHmac("sha256", this.secret).update(`${key}|${exp}`).digest("base64url");
  }
}
