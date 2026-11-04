import { createHash } from "node:crypto";
import sharp, { type Metadata } from "sharp";

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_PIXELS = 80_000_000; // decompression-bomb guard
const ALLOWED = new Set(["jpeg", "png", "webp"]);

export type ProcessedImage = { data: Buffer; ext: "png" | "jpg"; mime: string; width: number; height: number; sha256: string };

/**
 * Validate a customer image by decoding it (not by trusting the file name or MIME header),
 * apply EXIF rotation, and re-encode without metadata (GPS etc. are dropped).
 * PNG/WebP become PNG (keeps transparency); JPEG stays JPEG.
 */
export async function processUpload(input: Buffer): Promise<ProcessedImage> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new UploadError("This file is not a supported image. Use JPG, PNG or WebP.");
  }
  if (!meta.format || !ALLOWED.has(meta.format)) throw new UploadError("Use a JPG, PNG or WebP image.");
  if (!meta.width || !meta.height) throw new UploadError("The image has no size.");
  if (meta.width < 50 || meta.height < 50) throw new UploadError("The image is too small.");

  const pipeline = sharp(input, { limitInputPixels: MAX_PIXELS }).rotate();
  const jpeg = meta.format === "jpeg";
  const data = jpeg ? await pipeline.jpeg({ quality: 95, mozjpeg: true }).toBuffer() : await pipeline.png({ compressionLevel: 8 }).toBuffer();
  const out = await sharp(data).metadata();
  return {
    data,
    ext: jpeg ? "jpg" : "png",
    mime: jpeg ? "image/jpeg" : "image/png",
    width: out.width ?? meta.width,
    height: out.height ?? meta.height,
    sha256: createHash("sha256").update(data).digest("hex"),
  };
}

/** A rendered print file must be a PNG of exactly the print area's pixel size. */
export async function checkPrintFile(input: Buffer, widthPx: number, heightPx: number): Promise<void> {
  let meta: Metadata;
  try {
    meta = await sharp(input, { limitInputPixels: MAX_PIXELS }).metadata();
  } catch {
    throw new UploadError("Print file is not a valid PNG.");
  }
  if (meta.format !== "png") throw new UploadError("Print file must be a PNG.");
  if (meta.width !== widthPx || meta.height !== heightPx) {
    throw new UploadError(`Print file must be exactly ${widthPx}×${heightPx}px (got ${meta.width}×${meta.height}).`);
  }
}

export class UploadError extends Error {}
