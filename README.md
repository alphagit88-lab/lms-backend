# LMS Backend

REST API for the Learning Management System, built with **Node.js + Express + TypeScript + TypeORM + PostgreSQL**.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js v18+ |
| Framework | Express.js v5 |
| Language | TypeScript |
| ORM | TypeORM |
| Database | PostgreSQL v14+ |
| Auth | express-session + bcryptjs |
| Payments | Stripe |
| File Uploads | Multer |
| Video (Zoom) | Zoom Server-to-Server OAuth |
| Scheduler | node-cron |
| Package Manager | pnpm |

---

## Prerequisites

Install the following before starting:

- [Node.js v18+](https://nodejs.org/) — check with `node -v`
- [pnpm](https://pnpm.io/installation) — install with `npm install -g pnpm`
- [PostgreSQL v14+](https://www.postgresql.org/download/) — check with `psql --version`
- A [Stripe account](https://dashboard.stripe.com/register) (for payment features)
- A [Zoom Marketplace app](https://marketplace.zoom.us/) with Server-to-Server OAuth (for recording/meeting features)

---

## Local Setup

### 1. Clone the repository

```bash
git clone https://github.com/alphagit88-lab/lms-backend.git
cd lms-backend
git checkout dev
```

### 2. Install dependencies

```bash
pnpm install
```

### 3. Create the database

Open `psql` and run:

```sql
CREATE DATABASE lms_db;
```

### 4. Configure environment variables

Create a `.env` file in the project root:

```bash
cp .env.example .env   # or create manually from the template below
```

Fill in all required values (see [Environment Variables](#environment-variables) section).

### 5. Sync the database schema

```bash
pnpm db:sync
```

This auto-creates all tables from the TypeORM entities.

### 6. (Optional) Seed sample data

```bash
# Minimal seed (roles, admin user)
pnpm seed

# Full seed (users, courses, sessions, bookings)
pnpm seed:full
```

### 7. Start the development server

```bash
pnpm dev
```

The API will be available at **http://localhost:5000**

---

## Environment Variables

Create a `.env` file in the root with the following:

```env
# Server
PORT=5000
NODE_ENV=development

# Database
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_postgres_password
DB_DATABASE=lms_db

# CORS — set to your frontend URL
CORS_ORIGIN=http://localhost:3000

# Session
SESSION_SECRET=replace_with_a_long_random_string_at_least_32_chars

# File uploads
UPLOAD_DIR=./uploads

# Stripe — get from https://dashboard.stripe.com/apikeys
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...

# Zoom Server-to-Server OAuth — get from https://marketplace.zoom.us/
# Required scopes: meeting:write, recording:read
ZOOM_ACCOUNT_ID=your_zoom_account_id
ZOOM_CLIENT_ID=your_zoom_client_id
ZOOM_CLIENT_SECRET=your_zoom_client_secret
```

> **Tip:** For `SESSION_SECRET`, generate a strong value with:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## Available Scripts

```bash
pnpm dev            # Start development server with hot reload (nodemon)
pnpm build          # Compile TypeScript to dist/
pnpm start          # Run compiled production build
pnpm db:sync        # Sync TypeORM entities to the database (creates/alters tables)
pnpm seed           # Seed minimal data (admin user, roles)
pnpm seed:full      # Seed full sample data
pnpm test           # Run all Jest tests
pnpm test:watch     # Run tests in watch mode
pnpm test:coverage  # Run tests with coverage report
```

---

## Project Structure

```
src/
├── config/          # TypeORM data source & app config
├── controllers/     # Route handlers (request → response)
├── entities/        # TypeORM entity definitions (DB tables)
├── jobs/            # Scheduled cron jobs (payouts, etc.)
├── middleware/      # Auth, file upload, error handling middleware
├── migrations/      # TypeORM database migrations
├── routes/          # Express router definitions
├── scripts/         # One-off scripts (seed, db sync)
├── services/        # Business logic layer
├── types/           # Shared TypeScript type definitions
├── utils/           # Helper utilities
└── index.ts         # Application entry point

uploads/
├── documents/
├── images/
├── profile-pictures/
├── thumbnails/
└── videos/
```

---

## API Overview

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Health check |
| POST | `/api/auth/register` | Register a new user |
| POST | `/api/auth/login` | Login |
| POST | `/api/auth/logout` | Logout |
| GET | `/api/users` | List users (admin) |
| GET/PUT | `/api/users/:id` | Get / update user |
| GET/POST | `/api/courses` | List / create courses |
| GET/PUT/DELETE | `/api/courses/:id` | Course CRUD |
| GET/POST | `/api/bookings` | List / create bookings |
| GET | `/api/payments/history` | Payment history |
| POST | `/api/payments/checkout` | Create Stripe checkout session |
| POST | `/api/payments/webhook` | Stripe webhook handler |
| GET | `/api/recordings` | List recordings |
| GET | `/api/instructor/earnings` | Instructor earnings summary |

For the full Postman collection see [`postman_collection.json`](./postman_collection.json).

---

## Branching Strategy

| Branch | Purpose |
|--------|--------|
| `main` | Production-ready releases |
| `dev` | Active integration branch — PRs target here |
| `feature/*` | Individual feature branches (e.g. `feature/payments`) |

Always branch off `dev` and open a PR back to `dev` when your feature is complete.

---

## Common Issues

**`ECONNREFUSED` on startup** — PostgreSQL is not running. Start it and confirm the credentials in `.env` match.

**`relation "user" does not exist`** — Run `pnpm db:sync` to create the tables.

**Stripe webhook not working locally** — Use the [Stripe CLI](https://stripe.com/docs/stripe-cli) to forward events:
```bash
stripe listen --forward-to http://localhost:5000/api/payments/webhook
```
