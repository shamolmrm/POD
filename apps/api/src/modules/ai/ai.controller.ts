import { Body, Controller, Get, HttpCode, Post, UseGuards } from "@nestjs/common";
import type { User } from "@prisma/client";
import { z } from "zod";
import { AuditService } from "../../common/audit.service";
import { zodBody } from "../../common/http";
import { PrismaService } from "../../prisma.service";
import { AuthGuard, CurrentUser } from "../auth/guards";
import { processUpload } from "../designs/images";
import { StorageService } from "../files/storage.service";
import { AiService, STYLES } from "./ai.service";

const GenerateIn = z.object({
  prompt: z.string().trim().min(3, "Describe your idea").max(500),
  style: z.enum(Object.keys(STYLES) as [keyof typeof STYLES, ...Array<keyof typeof STYLES>]).default("illustration"),
});

@Controller("ai")
export class AiController {
  constructor(
    private readonly ai: AiService,
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
    private readonly audit: AuditService,
  ) {}

  @Get("status")
  status() {
    return { enabled: this.ai.enabled, styles: Object.keys(STYLES) };
  }

  /** Signed-in customers only (each image costs money). The result becomes a normal uploaded asset. */
  @Post("images")
  @HttpCode(200)
  @UseGuards(AuthGuard)
  async generate(@CurrentUser() user: User, @Body(zodBody(GenerateIn)) body: z.infer<typeof GenerateIn>) {
    const png = await this.ai.generate(body.prompt, body.style, user.id);
    const img = await processUpload(png);
    const key = this.storage.newKey("uploads", img.ext);
    await this.storage.save(key, img.data);
    const asset = await this.prisma.asset.create({
      data: { ownerId: user.id, storageKey: key, mime: img.mime, widthPx: img.width, heightPx: img.height, bytes: img.data.length, sha256: img.sha256, source: "AI" },
    });
    await this.audit.record("ai.image", { actorId: user.id, target: asset.id, detail: { prompt: body.prompt.slice(0, 200), style: body.style } });
    return { id: asset.id, widthPx: asset.widthPx, heightPx: asset.heightPx, url: this.storage.signedUrl(key, 7 * 86400) };
  }
}
