import { Controller, ForbiddenException, Get, NotFoundException, Param, Query, Res } from "@nestjs/common";
import type { Response } from "express";
import { StorageService } from "./storage.service";

const TYPES: Record<string, string> = { png: "image/png", jpg: "image/jpeg", webp: "image/webp" };

@Controller("files")
export class FilesController {
  constructor(private readonly storage: StorageService) {}

  /** Serve a stored file to whoever holds a valid signed URL (browser editor, Printify). */
  @Get("*key")
  async get(@Param("key") keyParts: string | string[], @Query("exp") exp: string, @Query("sig") sig: string, @Res() res: Response) {
    const key = Array.isArray(keyParts) ? keyParts.join("/") : keyParts;
    if (!this.storage.verify(key, exp ?? "", sig ?? "")) throw new ForbiddenException("Link expired or invalid.");
    let data: Buffer;
    try {
      data = await this.storage.read(key);
    } catch {
      throw new NotFoundException();
    }
    res.set({
      "Content-Type": TYPES[key.split(".").pop() ?? ""] ?? "application/octet-stream",
      "Cache-Control": "private, max-age=3000",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; sandbox",
      "Cross-Origin-Resource-Policy": "cross-origin",
    });
    res.send(data);
  }
}
