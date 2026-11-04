import { Injectable } from "@nestjs/common";
import { RedisService } from "../redis.service";

@Injectable()
export class RateLimitService {
  constructor(private readonly redis: RedisService) {}

  /** Count a hit; true when the limit for the window is exceeded. Fails open if Redis is down. */
  async hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
    try {
      const k = `rl:${key}`;
      const n = await this.redis.client.incr(k);
      if (n === 1) await this.redis.client.expire(k, windowSeconds);
      return n > limit;
    } catch {
      return false;
    }
  }

  async count(key: string): Promise<number> {
    try {
      return Number((await this.redis.client.get(`rl:${key}`)) ?? 0);
    } catch {
      return 0;
    }
  }

  async reset(key: string): Promise<void> {
    try {
      await this.redis.client.del(`rl:${key}`);
    } catch {
      /* ignore */
    }
  }
}
