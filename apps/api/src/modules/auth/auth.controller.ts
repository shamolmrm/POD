import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from "@nestjs/common";
import type { User } from "@prisma/client";
import type { Request, Response } from "express";
import { z } from "zod";
import { email, password, zodBody } from "../../common/http";
import { AuthService, toPublic } from "./auth.service";
import { AuthGuard, CurrentUser, OptionalAuthGuard } from "./guards";

const RegisterIn = z.object({ email, password, name: z.string().trim().min(2).max(80) });
const LoginIn = z.object({ email, password: z.string().min(1).max(200) });
const ChangeIn = z.object({ current: z.string().min(1).max(200), next: password });

@Controller("auth")
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post("register")
  register(
    @Body(zodBody(RegisterIn)) body: z.infer<typeof RegisterIn>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.register(body, req, res);
  }

  @Post("login")
  @HttpCode(200)
  login(
    @Body(zodBody(LoginIn)) body: z.infer<typeof LoginIn>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.auth.login(body, req, res);
  }

  @Post("logout")
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response): Promise<void> {
    await this.auth.logout(req, res);
  }

  /** Current user, or null for guests (200 either way so the UI can render without errors). */
  @Get("me")
  @UseGuards(OptionalAuthGuard)
  me(@CurrentUser() user: User | null) {
    return { user: user ? toPublic(user) : null };
  }

  @Post("password")
  @HttpCode(204)
  @UseGuards(AuthGuard)
  async changePassword(
    @CurrentUser() user: User,
    @Body(zodBody(ChangeIn)) body: z.infer<typeof ChangeIn>,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ): Promise<void> {
    await this.auth.changePassword(user, body.current, body.next, req, res);
  }
}
