import sharp from "sharp";
import type { RateLimitService } from "../src/common/rate-limit.service";
import { AiService, buildPrompt } from "../src/modules/ai/ai.service";

const limits = (over = 0) => {
  const n = new Map<string, number>();
  return {
    hit: async (k: string, limit: number) => {
      const v = (n.get(k) ?? over) + 1;
      n.set(k, v);
      return v > limit;
    },
  } as unknown as RateLimitService;
};

describe("AI design", () => {
  const realFetch = global.fetch;
  afterEach(() => {
    global.fetch = realFetch;
    delete process.env.AI_PROVIDER;
    delete process.env.AI_API_KEY;
  });

  it("is off without configuration", async () => {
    const ai = new AiService(limits());
    expect(ai.enabled).toBe(false);
    await expect(ai.generate("a cat", "cartoon", "u1")).rejects.toThrow(/not enabled/);
  });

  it("builds a print-oriented prompt that keeps the customer's idea", () => {
    const p = buildPrompt("  a fox reading a book ", "vintage");
    expect(p).toContain("transparent background");
    expect(p).toContain("vintage retro");
    expect(p.endsWith("Request: a fox reading a book")).toBe(true);
  });

  it("calls the images endpoint with a transparent PNG request and returns the bytes", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-test";
    const png = await sharp({ create: { width: 64, height: 64, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
    const fetchMock = jest.fn(async () => ({ ok: true, status: 200, json: async () => ({ data: [{ b64_json: png.toString("base64") }] }) }));
    global.fetch = fetchMock as unknown as typeof fetch;
    const out = await new AiService(limits()).generate("a cat", "cartoon", "u1");
    expect(out.equals(png)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.openai.com/v1/images/generations");
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({ background: "transparent", output_format: "png", size: "1024x1024", n: 1 });
    expect(body.safety_identifier).not.toContain("u1"); // hashed, not the raw user id
  });

  it("maps a refused prompt to a friendly 400 and enforces per-user limits", async () => {
    process.env.AI_PROVIDER = "openai";
    process.env.AI_API_KEY = "sk-test";
    global.fetch = jest.fn(async () => ({ ok: false, status: 400, json: async () => ({ error: { code: "moderation_blocked" } }) })) as unknown as typeof fetch;
    await expect(new AiService(limits()).generate("x", "photo", "u1")).rejects.toThrow(/can't create that image/);
    await expect(new AiService(limits(5)).generate("x", "photo", "u1")).rejects.toThrow(/5 AI designs per hour/);
  });
});
