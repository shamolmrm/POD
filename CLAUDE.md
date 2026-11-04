# POD — Instructions for Claude

## Project
Custom print-on-demand store: product catalog, browser design editor, checkout, paid orders sent to
Printify. Master plan: `docs/00-MASTER-PLAN.md`. Read it before any feature work.

## Stack
- Web: Next.js (App Router) + TypeScript strict + Tailwind CSS + shadcn/ui, Fabric.js editor, pnpm workspaces
- API: NestJS + Prisma + PostgreSQL, Redis + BullMQ (worker = same image), Cloudflare R2 (S3 API)
- Infra: Docker Compose, shared VPS behind Nginx Proxy Manager, `pod.supersoftltd.com`

## Working rules
- The owner communicates in Bengali/Banglish; reply in Bengali.
- One phase at a time: plan → implement → test → deploy → update `docs/`. Ask before starting the next phase.
- Never commit secrets; only `.env.example` goes in Git. Printify/PSP/R2 keys stay server-side.
- Never invent API endpoints: check the provider's docs (Printify: developers.printify.com).
- Never fake payment success. An order is PAID only after server-to-server verification; nothing goes to Printify before that.
- Keep the architecture simple; ask before adding new services or infrastructure.
- On the shared VPS, never touch other projects' containers or volumes.

## Git
- Conventional commits (`feat:`, `fix:`, `docs:`, `chore:`).
- After every completed change: commit, then push (origin = shamolbro/POD, mirror = shamolmrm/POD via `.scriptspush-all.ps1`; deploy with `bash scripts/deploy.sh`).
