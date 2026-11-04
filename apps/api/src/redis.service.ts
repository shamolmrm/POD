import { Inject, Injectable, OnModuleDestroy } from "@nestjs/common";
import Redis from "ioredis";
import { CONFIG, type Config } from "./config";

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(@Inject(CONFIG) config: Config) {
    // lazyConnect: the app starts even if Redis is briefly down; readiness reports it
    this.client = new Redis(config.redisUrl, { lazyConnect: true, maxRetriesPerRequest: 2 });
  }

  async ping(): Promise<boolean> {
    try {
      if (this.client.status === "wait") await this.client.connect();
      return (await this.client.ping()) === "PONG";
    } catch {
      return false;
    }
  }

  onModuleDestroy(): void {
    this.client.disconnect();
  }
}
