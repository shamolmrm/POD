# POD — Master Plan (Phase 1: inspection & architecture)

Status: **Phase 1 approved 2026-11-04; Phase 2 (skeleton + infra) done 2026-11-04.**
Date: 2026-11-04 · Live slot reserved: `pod.supersoftltd.com` (DNS record pending)

A custom print-on-demand store: customers worldwide pick a product, design it in a browser
editor (upload images, add text, optional AI art), see a live mockup, pay, and the paid order is
sent to **Printify** for printing and shipping.

---

## 1. Repository inspection

- `D:\devloper\POD` was **empty** (no files, no Git). This is a greenfield build.
- Neighbouring projects on the same VPS use FastAPI; this project uses the stack the brief asks
  for (NestJS + Prisma). Infra conventions are reused: Docker Compose per project, the shared
  Nginx Proxy Manager, host certbot (webroot), `deploy.sh` (test build → swap → smoke test),
  nightly `pg_dump` backup, two Git remotes.
- VPS capacity (shared Contabo, 4 vCPU / 7.8 GB): about 3.9 GB RAM and 74 GB disk free today.
  POD budget: ~1.5 GB RAM (web 384 MB, api 512 MB, worker 384 MB, Postgres 256 MB, Redis 128 MB).
  Artwork files live in R2, not on the VPS disk.

## 2. Verified facts that shape the design

### Printify API (from developers.printify.com, read 2026-11-04)
| Topic | What the docs say |
|---|---|
| Base URL | `https://api.printify.com/v1/`, JSON, HTTPS only, `User-Agent` header required |
| Auth | Personal Access Token (single merchant, valid 1 year, `Authorization: Bearer`). OAuth 2.0 only for multi-merchant platforms (needs app approval). **We use a PAT.** |
| CORS | Not supported, so all calls go through our server. The token never reaches the browser. |
| Shop | Create a store of type **"API"** in Printify (My Stores → Add → API). Get `shop_id` from `GET /v1/shops.json`. |
| Catalog | `GET /v1/catalog/blueprints.json`, `…/blueprints/{id}/print_providers.json`, `…/print_providers/{pp}/variants.json`, `…/print_providers/{pp}/shipping.json`. Catalog limit: 100 req/min. |
| Uploads | `POST /v1/uploads/images.json` with `{file_name, url}` (recommended above 5 MB) or `{file_name, contents}` (base64). Low-quality art is rejected (`400`, code `8203`). |
| Products | `POST /v1/shops/{shop_id}/products.json`. `print_areas` per position. Image `x`,`y` are 0–1 with the centre at 0.5,0.5. `scale` 1.0 fills the area. `angle` 0–360. |
| Orders | `POST /v1/shops/{shop_id}/orders.json` with `external_id` (ours) and line items `product_id`+`variant_id`+`quantity`. Shipping quote: `POST …/orders/shipping.json`. Manual release: `POST …/orders/{id}/send_to_production.json`. Cancel only while `on-hold`/`payment-not-received`: `POST …/orders/{id}/cancel.json`. |
| On-the-fly items | Allowed but **slow, may time out, and will be deprecated**. So we create a (hidden, unpublished) product per design first. |
| Webhooks | `GET/POST /v1/shops/{shop_id}/webhooks.json`, `PUT/DELETE …/webhooks/{id}.json`. Topics include `order:created`, `order:updated`, `order:sent-to-production`, `order:shipment:created`, `order:shipment:delivered`, `order:line-item:canceled`. Signature: header `X-Pfy-Signature: sha256=<HMAC-SHA256 hex of body with our secret>`. Retries 3× on errors, then blocks the hook for 1 h. |
| Limits | 600 req/min global. Errors must stay below 5 % of requests. |
| Not stated | Exact DPI rule, max file size. **Phase 2 must read real placeholder sizes from the variants endpoint and test uploads before the editor fixes its rules.** |

Who pays Printify: Printify charges the **merchant's** billing method (card / balance) for each
order. The owner needs a card or balance that can pay USD to Printify. Check the bank's USD
limits for a Bangladeshi international card.

### Payments for a Bangladesh-based merchant (researched 2026-11-04; confirm with each provider)
| Option | Status for a Bangladesh business | Fit |
|---|---|---|
| Stripe | **Not available** to Bangladesh-registered businesses. A foreign company (e.g. US LLC / UK Ltd) is a separate legal/tax project. | Only via a foreign entity |
| PayPal | **No business accounts** for Bangladesh addresses. | ✗ |
| Paddle / Lemon Squeezy (Merchant of Record) | Built for digital goods and SaaS. Lemon Squeezy normally rejects physical goods. | ✗ |
| **SSLCOMMERZ** (and similar local PSPs: aamarPay, shurjoPay) | Licensed in Bangladesh. Advertises taking foreign Visa/Mastercard. Settlement currency, Bangladesh Bank export rules and any per-transaction caps must be confirmed with them. Has a free **sandbox**. | **Most realistic first gateway** |
| 2Checkout (Verifone) | Lists Bangladesh and physical goods, but approval reports are mixed. | Possible second gateway |
| Payoneer Checkout | Bangladesh eligibility unclear (earlier only HK entities). | Ask Payoneer |

Design consequence: a **payment-provider interface**. The order pipeline only trusts a payment
after the provider confirms it server-to-server (a signed webhook/IPN **plus** an API
validation call), never from a browser redirect. The first adapter will be SSLCOMMERZ
(sandbox) unless the owner chooses otherwise.

## 3. Architecture

```
Browser ──HTTPS──> Nginx Proxy Manager ──> pod-web  (Next.js, SSR/SEO, editor)
                                       └─> pod-api  (NestJS REST, /api/v1)
pod-api ──> PostgreSQL (Prisma)      pod-api ──> Redis (sessions, rate limits, BullMQ)
pod-worker (NestJS, same code) ──> BullMQ jobs: printify-submit, printify-sync, email, mockup, ai
pod-api / worker ──> Cloudflare R2 (S3 API): uploads, print-ready artwork, mockups
pod-api ──> Printify REST     Printify ──webhook──> pod-api /webhooks/printify
pod-api ──> Payment provider  Provider ──IPN/webhook──> pod-api /webhooks/payments/:provider
```

- **Modular monolith.** One NestJS app with domain modules. The worker is the same image started
  in worker mode, so there is one codebase and one deploy.
- **Browser never talks to Printify, the payment provider's secret API, or R2 with secrets.**
  Uploads go to R2 via short-lived **presigned PUT URLs** that the API issues after checking
  type, size and quota. Downloads use short-lived presigned GET URLs.
- **Money and order truth live in our DB.** Printify and the PSP are mirrored through
  idempotent jobs and verified webhooks.

### Order pipeline (the critical path)
1. Cart → checkout: the server re-prices everything (never trusts client prices) and gets a
   **live Printify shipping quote**. It creates `Order(status=PENDING_PAYMENT)` and a
   `Payment(INITIATED)`.
2. Customer pays on the provider's hosted page.
3. Provider IPN arrives. Verify the signature/hash, call the provider's validation API, then check
   amount + currency + our order id. Only then: `Payment(SUCCEEDED)` and `Order(PAID)`.
   Duplicate IPNs are ignored (unique provider transaction id).
4. Enqueue `printify-submit` (idempotent by order id):
   1. Render/export the **print-ready file** per print area at the placeholder's exact pixel size.
   2. Store it in R2.
   3. `uploads/images.json` by presigned URL.
   4. Create a hidden product.
   5. Create the order with `external_id = our order number`.
   6. Release it with `send_to_production` (shop set to manual approval, so nothing prints
      before our checks pass).
5. Printify webhooks update the status, tracking number/URL and delivery, and trigger emails.
6. Failures: retries with backoff. After the last retry the order is flagged `NEEDS_ATTENTION`
   in admin. **Payment is never auto-faked or skipped.** Refunds are manual-first, through the
   provider.

## 4. Design editor
- **Fabric.js v6** (TypeScript, rich text editing, object controls, JSON + SVG export,
  filters). It fits a Canva-like editor better than Konva.
- The canvas works in **print-area coordinates**: each product side (front, back, sleeve…) is a
  print area whose real pixel size comes from Printify placeholders. The screen view is scaled.
  Export renders at full resolution.
- Features v1: upload image (PNG/JPG/WebP/SVG→raster), text (fonts we license-check), layers,
  align/snap, undo/redo, safe-area guides, **effective-DPI meter per image** (warns below the
  threshold, blocks below the minimum), live 2D mockup (product photo + design). Later:
  templates, shapes, clipart, background removal, AI images.
- Saved as `Design` JSON (versioned) + exported print files. A finished order freezes the exact
  design version used.

## 5. Database (Prisma, PostgreSQL) — first cut
| Area | Models (key fields) |
|---|---|
| Identity | `User` (email unique, passwordHash argon2, name, role CUSTOMER/ADMIN/STAFF, emailVerifiedAt), `Session` (tokenHash, expiresAt, ip, ua), `VerificationToken`, `Address` |
| Catalog | `Product` (slug, title, description, status, seo, printifyBlueprintId, printifyProviderId, basePriceCents, currency), `ProductVariant` (printifyVariantId, options json: size/colour, costCents, priceCents, isEnabled), `PrintArea` (position, widthPx, heightPx, dpi, safeArea json), `ProductImage`/`MockupTemplate`, `Category` |
| Design | `Asset` (owner, r2Key, mime, widthPx, heightPx, bytes, sha256, source UPLOAD/AI, moderation status), `Design` (owner or guest token, productId, currentVersion), `DesignVersion` (canvas json, perArea placements, preview r2Key, printFiles json, createdAt) |
| Commerce | `Cart`/`CartItem` (variant, designVersion, qty), `Coupon` (code, type %/fixed, limits, validity), `CouponRedemption`, `Order` (number, status, totals in cents, currency, shipping address snapshot, shippingMethod, printifyOrderId, external_id), `OrderItem` (variant, designVersion frozen, unit price, printifyProductId), `Payment` (provider, providerTxnId unique, amount, currency, status, raw payload hash), `Refund` |
| Fulfilment | `Shipment` (carrier, trackingNumber, trackingUrl, shippedAt, deliveredAt), `WebhookEvent` (source, eventId unique, signatureOk, processedAt) — gives idempotency + audit |
| Content | `Review` (verified-purchase only, rating, text, status), `EmailLog`, `AuditLog` (actor, action, target, ip) |
| Settings | `Setting` (markup rules, DPI thresholds, AI on/off, shop open/closed) |

All money is integer cents + ISO currency. Status changes go through one service with an allowed
transition table.

## 6. Folder structure (pnpm monorepo)
```
POD/
  apps/
    web/        Next.js App Router, TS strict, Tailwind, shadcn/ui; (shop) storefront, (editor), (account), (admin)
    api/        NestJS: src/modules/{auth,users,catalog,printify,designs,assets,cart,checkout,payments,orders,
                fulfillment,coupons,reviews,notifications,ai,admin,health}, src/jobs (BullMQ processors), prisma/
  packages/
    shared/     zod schemas + types shared by web and api (DTOs, enums, money helpers)
    editor/     Fabric.js editor core (framework-agnostic), print-area math, DPI checks
  infrastructure/production/  docker-compose.yml, nginx/pod.conf, enable-domain.sh, backup.sh
  scripts/      push-all.ps1, deploy.sh
  docs/         00-MASTER-PLAN.md, phase plans, runbooks
```

## 7. Environment variables (names only; values live in the VPS `.env`, never in Git)
```
NODE_ENV, PUBLIC_BASE_URL=https://pod.supersoftltd.com
DATABASE_URL, REDIS_URL
SESSION_SECRET, DATA_ENCRYPTION_KEY            # sessions, encrypted tokens at rest
PRINTIFY_API_TOKEN, PRINTIFY_SHOP_ID, PRINTIFY_WEBHOOK_SECRET, PRINTIFY_USER_AGENT
R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL (mockups only)
PAYMENT_PROVIDER=sslcommerz
SSLCOMMERZ_STORE_ID, SSLCOMMERZ_STORE_PASSWORD, SSLCOMMERZ_SANDBOX=true
SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD, MAIL_FROM
AI_PROVIDER (empty = off), AI_API_KEY
```
Only `NEXT_PUBLIC_*` values reach the browser, and none of them are secrets.

## 8. Security plan
- Secrets only on the server. `.env` is generated on the VPS. Printify token and PSP keys are never
  logged. Admin "test connection" shows only ok/fail.
- Auth: argon2id, httpOnly + Secure + SameSite=Lax session cookie (hashed in DB), CSRF via Origin
  check + SameSite, login rate limit + lockout, email verification, optional TOTP for admins.
- RBAC: customer / staff / admin, with a guard on every admin route. Customers only see their own
  designs, orders and assets (ownership checks, 404 on others).
- Uploads: presigned PUT with exact content-type + size, server re-checks magic bytes and pixel
  dimensions, strips EXIF, image-bomb pixel cap, SVG sanitised or rasterised, quota per user.
- Webhooks: raw-body HMAC verification (`X-Pfy-Signature`), constant-time compare, event-id
  dedupe, fast 2xx then queue. PSP IPN: hash check **and** server-side validation API.
- Money: server-side pricing, integer cents, idempotency keys on checkout and on Printify
  submission, transaction + row locks around status changes.
- Content: terms forbidding infringing art, report button, admin review queue for flagged
  designs. Printify's own IP detection can cancel items, which we surface to admin.
- Platform: Helmet/CSP, strict CORS (own origin), Zod/class-validator on every input, Prisma
  (no raw SQL), audit log for admin actions, dependency audit in CI, nightly DB backup, R2
  bucket private by default.

## 9. Phased roadmap (each phase: plan → build → tests → deploy → docs; owner approves the next)
| # | Phase | Outcome |
|---|---|---|
| 1 | Inspection & architecture | **This document** |
| 2 ✅ | Skeleton + infra | Monorepo, Next + Nest + Prisma + Redis + BullMQ, health checks, tests in CI build, Docker, deploy to `pod.supersoftltd.com` ("coming soon"), backups |
| 3 | Auth & profiles | Register/login/verify/reset, sessions, addresses, roles, admin bootstrap CLI |
| 4 | Printify connection + catalog | Token check, shop id, blueprint/provider/variant sync into our catalog, placeholders → print areas, markup pricing, webhook registration |
| 5 | Storefront | Category/product pages, variant picker, SEO (metadata, sitemap, JSON-LD), responsive + accessible |
| 6 | Design editor v1 | Fabric editor, uploads to R2, text, layers, DPI meter, mockup preview, save designs |
| 7 | Cart & shipping | Cart (guest + user), live Printify shipping quote by country, coupons |
| 8 | Payments | Provider interface + SSLCOMMERZ sandbox, verified IPN, order PAID only after validation |
| 9 | Fulfilment pipeline | Print-file export, Printify upload/product/order/send_to_production jobs, webhooks, tracking, emails |
| 10 | Admin dashboard | Orders (retry/flag), products, pricing, coupons, customers, reviews moderation, audit log |
| 11 | Reviews & polish | Verified reviews, account order history, email templates |
| 12 | AI design (optional module) | Provider interface, off by default, moderation, usage limits |
| 13 | Go-live hardening | Security review, load test, accessibility audit, live payment keys, legal pages |

## 10. Decisions needed from the owner
1. **Approve this plan** (stack, Printify-per-design-product flow, SSLCOMMERZ-first).
2. **Payment route:** apply to SSLCOMMERZ for an international-card store (trade license etc.), or
   do you have a foreign company for Stripe?
3. **Printify:** create an account, add an "API" store, add a billing card, then share the Personal
   Access Token **only into the server `.env`** (never in chat).
4. **Cloudflare R2:** OK to use (new external service)? You need a Cloudflare account.
5. **Email (SMTP)** provider for order emails.
6. **Store basics:** brand name, sell currency (USD suggested), which product types first (e.g.
   T-shirts, mugs, posters), target countries.
7. **GitHub:** create private repos `shamolbro/POD` + `shamolmrm/POD` (same two-remote setup)?
8. **DNS:** A record `pod` → `144.91.74.148` at Namecheap.
