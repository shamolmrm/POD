import { BadRequestException, Injectable, Logger, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { TooManyRequests } from "../../common/http";
import { RateLimitService } from "../../common/rate-limit.service";

/**
 * Optional AI artwork. Off unless AI_PROVIDER and AI_API_KEY are set on the server.
 * OpenAI Images API (developers.openai.com/api/reference): POST {base}/images/generations,
 * GPT image models return base64 PNG; `background: "transparent"` suits garment printing.
 * gpt-image-1 was retired on 2026-10-23, so the model is configurable (AI_MODEL).
 */

export const STYLES = {
  illustration: "clean vector-style illustration, bold shapes, limited color palette",
  cartoon: "fun cartoon style, thick outlines, bright colors",
  vintage: "vintage retro t-shirt graphic, distressed texture, muted colors",
  lineart: "minimal single-color line art",
  watercolor: "soft watercolor painting style",
  photo: "photorealistic, studio lighting",
} as const;
export type Style = keyof typeof STYLES;

/** Wrap the customer's idea in instructions that produce printable artwork. */
export function buildPrompt(idea: string, style: Style): string {
  return [
    "Artwork for printing on a product (t-shirt / mug / poster).",
    `Style: ${STYLES[style]}.`,
    "Single centered subject, isolated on a fully transparent background, no mockup, no product, no border, no watermark.",
    "Only include text if the request explicitly asks for words.",
    `Request: ${idea.trim()}`,
  ].join(" ");
}

@Injectable()
export class AiService {
  private readonly log = new Logger("AI");
  private readonly provider = process.env.AI_PROVIDER ?? "";
  private readonly key = process.env.AI_API_KEY ?? "";
  private readonly model = process.env.AI_MODEL || "gpt-image-2.5-flare";
  private readonly base = process.env.AI_BASE_URL || "https://api.openai.com/v1";
  private readonly dailyLimit = Number(process.env.AI_DAILY_LIMIT || 200);

  constructor(private readonly limits: RateLimitService) {}

  get enabled(): boolean {
    return this.provider === "openai" && !!this.key;
  }

  /** Returns PNG bytes. Limits: 5/hour and 20/day per customer, plus a shop-wide daily cap (costs money). */
  async generate(idea: string, style: Style, ownerId: string): Promise<Buffer> {
    if (!this.enabled) throw new ServiceUnavailableException("AI design is not enabled.");
    if (await this.limits.hit(`ai:h:${ownerId}`, 5, 3600)) throw new TooManyRequests("You can create 5 AI designs per hour. Please try again later.");
    if (await this.limits.hit(`ai:d:${ownerId}`, 20, 86400)) throw new TooManyRequests("Daily AI design limit reached. Please try again tomorrow.");
    if (await this.limits.hit("ai:shop", this.dailyLimit, 86400)) throw new ServiceUnavailableException("AI design is busy today. Please try again tomorrow.");

    const res = await fetch(`${this.base}/images/generations`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.key}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: buildPrompt(idea, style),
        n: 1,
        size: "1024x1024",
        quality: "high",
        background: "transparent",
        output_format: "png",
        moderation: "auto",
        // lets the provider spot abuse per end user without receiving personal data
        safety_identifier: createHash("sha256").update(`pod:${ownerId}`).digest("hex").slice(0, 32),
      }),
      signal: AbortSignal.timeout(180_000),
    });
    const data = (await res.json().catch(() => ({}))) as { data?: Array<{ b64_json?: string }>; error?: { code?: string; message?: string } };
    if (!res.ok) {
      this.log.warn(`provider ${res.status}: ${data.error?.code ?? ""} ${data.error?.message?.slice(0, 200) ?? ""}`);
      if (res.status === 400) throw new BadRequestException("We can't create that image. Please describe something else (no brands, famous characters or people).");
      throw new ServiceUnavailableException("AI design is not available right now. Please try again.");
    }
    const b64 = data.data?.[0]?.b64_json;
    if (!b64) throw new ServiceUnavailableException("AI design returned no image. Please try again.");
    return Buffer.from(b64, "base64");
  }
}
