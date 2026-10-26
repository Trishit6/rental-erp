---
name: run-revaro
description: Run, start, or screenshot the Revaro marketplace web application (Vite + Express API + MariaDB)
---

# Run Revaro

Revaro is a web application with a React 19 + Vite frontend (port 5173) and an Express 5 API (port 3001) backed by MariaDB (port 3307).

## Prerequisites

- Node.js 20+
- pnpm 11+
- Running MariaDB instance on port 3307 (database `reloop`)

## Setup & Build

```bash
# Install dependencies
pnpm install

# Check TypeScript types
pnpm typecheck

# Build the production assets
pnpm build
```

## Run (Agent Path)

### 1. Launch the API Server
Start the Express API server on port 3001:
```bash
pnpm start:api
```

### 2. Launch Full Development Environment
Run both Vite dev server and API watch mode concurrently:
```bash
pnpm dev
```
- Frontend: http://localhost:5173
- API: http://localhost:3001 (proxied via Vite at `/api/*`)

### 3. Drive the App (Web / Headless Browser)
To interact with the running web app, open http://localhost:5173 in a headless browser or curl the API endpoint:
```bash
# Health check
curl -s http://localhost:3001/api/health
```

## Run (Human Path)

```bash
pnpm dev
```
Open your browser at `http://localhost:5173`.

## Gotchas & Troubleshooting

- **MariaDB Connection Refused**: Ensure MariaDB is running locally on port 3307 and credentials in `.env` match (`DATABASE_URL=mysql://root:...@localhost:3307/reloop`).
- **Missing Secrets Error**: The API requires `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, and `MFA_ENCRYPTION_KEY` to be set in `.env`.
- **Database Seed**: Do not run `pnpm db:seed` in production as it truncates tables.
