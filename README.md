# POD — custom print-on-demand store

Customers design products (T-shirts, mugs, posters…) in a browser editor, pay, and paid orders are
fulfilled by Printify.

- **Live:** https://pod.supersoftltd.com (coming-soon page)
- **Status:** Phases 1–11 built: accounts, Printify catalog import, storefront with SEO, Fabric.js design editor (print areas, DPI check, uploads, saved designs), cart + coupons + live Printify shipping, SSLCOMMERZ checkout (server-verified), automatic Printify fulfilment + webhooks + tracking, emails, admin (orders, products, coupons, reviews), optional AI artwork (OpenAI Images, off until a key is set). Waiting for credentials (Printify, SSLCOMMERZ, SMTP) to sell. Plan: [docs/00-MASTER-PLAN.md](docs/00-MASTER-PLAN.md)
- **Stack:** Next.js + TypeScript + Tailwind (+ shadcn/ui, Fabric.js later) · NestJS + Prisma + PostgreSQL · Redis + BullMQ · Cloudflare R2 · Printify API

## Layout
```
apps/web   Next.js App Router (standalone build)
apps/api   NestJS API + BullMQ worker (same image), Prisma schema + migrations
infrastructure/production   docker-compose, nginx site, backup, enable-domain
scripts    deploy.sh (Git Bash), push-all.ps1
```

## Local development
```
docker compose up -d                       # Postgres :5434, Redis :6381
cp .env.example apps/api/.env
cd apps/api && pnpm install && pnpm build && pnpm migrate && pnpm start   # :4000
cd apps/web && pnpm install && pnpm dev                                     # :3000 (proxies /api)
```

## Deploy
`bash scripts/deploy.sh` → uploads HEAD, runs API typecheck + tests in Docker, builds, migrates, starts, smoke-tests.
Then `.\scripts\push-all.ps1` pushes to both remotes.
