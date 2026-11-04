import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma.service";

@Injectable()
export class AuditService {
  private readonly log = new Logger("Audit");

  constructor(private readonly prisma: PrismaService) {}

  /** Record a security-relevant action. Never throws: auditing must not break the request. */
  async record(
    action: string,
    opts: { actorId?: string | null; target?: string; ip?: string; detail?: Prisma.InputJsonValue } = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: { action, actorId: opts.actorId ?? null, target: opts.target, ip: opts.ip, detail: opts.detail },
      });
    } catch (err) {
      this.log.error(`audit ${action} failed: ${(err as Error).message}`);
    }
  }
}
