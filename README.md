# Vape and Sounds — Inventory & Sales Management System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.0-blue)](https://www.typescriptlang.org/)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-10-red)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-15-blue)](https://www.postgresql.org/)

A multi-branch inventory and point-of-sale system for the **Vape and Sounds**
shop. Staff record sales on a simple POS; Admins and the Owner review, approve,
and report on them. Prices and stock are tracked **per branch**, and images are
stored on Cloudinary.

> This README describes what the app **actually does today**. Features are kept
> intentionally lean — see [Features](#-features) for the real list.

## 🎯 Overview

- **Role-based access** — Owner, Admin, Staff, and a read-only Viewer role.
- **Per-branch catalog & inventory** — each shop has its own stock levels and
  can override a product's selling price; products/brands can be archived
  globally or per branch.
- **Point of Sale (POS)** — Staff build a draft order and submit it; each item
  records its own payment method.
- **Payment methods** — **Cash, GCash, BDO, BPI**, plus **Split** (one item
  paid across several of those) and an automatic **Mixed** rollup label when a
  sale's items don't all share one method.
- **Approval workflow** — Sales, disposals, and expenses are submitted by Staff
  and **approved/declined by an Admin/Owner**; stock moves on approval.
- **Reporting** — Owner Profit & Loss (uses confidential cost prices on the
  server), Admin cost-free Sales Summary, top-selling and most-disposed
  products, and a per-branch daily report.
- **Stock movement history** — every stock change (sale, restock, disposal,
  return, adjustment) is logged per product per branch.
- **Audit logging** — key actions are recorded for traceability.
- **Image storage** — product/brand/avatar images upload to **Cloudinary**
  (falls back to inline base64 if Cloudinary env vars aren't set).

## 🏗️ Architecture

**Stack:**
- **Frontend:** Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS,
  Zustand (state), React Query (data fetching)
- **Backend:** NestJS 10, TypeScript, Prisma 5 ORM, Passport + JWT auth
- **Database:** PostgreSQL 15 (Supabase)
- **Images:** Cloudinary

**Deployment (production):**
- **Database:** Supabase (PostgreSQL, Singapore region)
- **Backend API:** Render (web service, `backend/` root)
- **Frontend:** Vercel (`frontend/` root)

Migrations and the bootstrap seed run automatically on backend boot
(`backend/src/run-migrations.ts`).

## 🚀 Local Development

### Prerequisites
- Node.js 20+ LTS
- PostgreSQL 15+ (local or a Supabase connection string)
- npm

### Setup

1. **Clone:**
   ```bash
   git clone <repository-url>
   cd Vp-and-Sounds-Inventory-System
   ```

2. **Environment variables:**
   ```bash
   cp backend/.env.example backend/.env       # set DATABASE_URL, JWT secrets, Cloudinary (optional)
   cp frontend/.env.example frontend/.env.local  # set NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
   ```

3. **Install dependencies:**
   ```bash
   cd backend && npm install
   cd ../frontend && npm install
   ```

4. **Database (from `backend/`):**
   ```bash
   npx prisma generate
   npx prisma migrate dev
   npm run db:seed
   ```

5. **Run (two terminals):**
   ```bash
   # backend (port 4000)
   cd backend && npm run start:dev
   # frontend (port 3000)
   cd frontend && npm run dev
   ```

6. **Access:**
   - Frontend: http://localhost:3000
   - API: http://localhost:4000
   - API docs (Swagger): http://localhost:4000/api/docs
   - Prisma Studio: `cd backend && npx prisma studio`

> A `docker-compose.dev.yml` is included for spinning up a local Postgres if you
> don't have one installed.

## 👥 Default Accounts (seed)

The seed creates two bootstrap accounts. Create shops, staff, and more admins
from inside the app afterwards.

| Role  | Email                   | Password        |
|-------|-------------------------|-----------------|
| Owner | owner@chxinventory.com  | OwnerPass123!   |
| Admin | admin@chxinventory.com  | ChangeMe123!    |

The seed emails/passwords can be overridden with `SEED_ADMIN_EMAIL` /
`SEED_ADMIN_PASSWORD`. Both accounts are flagged to force a password change on
first login.

⚠️ **Change these credentials before going live.**

## 👤 Roles

- **Owner** — full access, including confidential cost/profit data (Capital,
  Net Profit, Margin) and user management.
- **Admin** — manage catalog, inventory, branches, staff; approve/decline
  sales, disposals, and expenses; cost-free Sales Summary (no profit figures).
- **Staff** — branch-scoped POS: build and submit sales/disposals/expenses,
  view products and their own daily report.
- **Viewer** — read-only: view products and stock-movement history; cannot
  change anything.

## 🔐 Security

- JWT authentication with refresh tokens
- bcrypt password hashing (configurable rounds, default 12)
- Role-based access control, enforced on the server
- Rate limiting (`@nestjs/throttler`)
- Security headers via Helmet
- Server-side input validation (`class-validator`)
- Audit logging of key actions

## 🧪 Testing

```bash
cd backend
npm run test       # unit tests
npm run test:e2e   # end-to-end tests
```

> Test coverage is currently light and is an area for future improvement.

## 📦 Build

```bash
cd backend && npm run build    # outputs to dist/src/main.js
cd frontend && npm run build
```

## 🚢 Deployment

The repo is wired for **Supabase + Render + Vercel**:

1. **Supabase** — create a PostgreSQL project (Singapore region). Grab the
   transaction pooler URL (port 6543, `?pgbouncer=true`) for `DATABASE_URL` and
   the session pooler URL (port 5432) for `MIGRATE_DATABASE_URL`.
2. **Render** — deploy `backend/` as a Node web service (see `render.yaml`).
   Start command: `node dist/src/main.js`. Set `DATABASE_URL`,
   `MIGRATE_DATABASE_URL`, `CORS_ORIGIN` (your Vercel URL), JWT secrets, and
   optional Cloudinary vars. Migrations + seed run on boot.
3. **Vercel** — deploy with **Root Directory = `frontend`**. Set
   `NEXT_PUBLIC_API_URL` to `https://<your-render-app>.onrender.com/api/v1`.

> On Render's free tier the backend sleeps after inactivity; the first request
> after a cold start can take ~30–50s.

## 📁 Project Structure

```
backend/    NestJS API (modules: auth, users, branches, brands, products,
            sales, disposals, expenses, stats, stock-movements, activity-logs)
frontend/   Next.js app (dashboard = Owner/Admin/Viewer, staff = POS portal)
brand-assets/  Source brand images (logos, wallpapers)
docs/       Design/reference docs (aspirational — not all of it is implemented)
```

## 📜 License

MIT — see [LICENSE](LICENSE).

---

**App:** Vape and Sounds Inventory & Sales Management System
