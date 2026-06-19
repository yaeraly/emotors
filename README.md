# EMOTORS OS Phase 1 — Foundation

Business operating system foundation for an electric tricycle spare parts,
repair, and sales company.

## Stack

- Monorepo: npm workspaces
- API: NestJS 11, Prisma ORM, PostgreSQL
- WEB: Next.js 15+, TypeScript, TailwindCSS
- Auth: JWT access token and refresh token
- TypeScript: 5.8.3

## Project Structure

```txt
root/
├── apps/
│   ├── api/
│   └── web/
├── docker-compose.yml
├── package.json
├── tsconfig.base.json
└── README.md
```

## Installation

```bash
npm install
```

## PostgreSQL Setup

Default connection:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/emotors?schema=public"
```

Start PostgreSQL with Docker:

```bash
docker compose up -d postgres
```

Or create the database manually in a local PostgreSQL server:

```sql
CREATE DATABASE emotors;
```

## Environment Variables

Create `apps/api/.env`:

```bash
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/emotors?schema=public"
JWT_ACCESS_SECRET="change-me-access-secret"
JWT_REFRESH_SECRET="change-me-refresh-secret"
JWT_ACCESS_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"
PORT=3001
WEB_ORIGIN="http://localhost:3000"
```

Optional WEB variable:

```bash
NEXT_PUBLIC_API_URL="http://localhost:3001"
```

## Prisma Migration

```bash
npm run prisma:migrate -w @emotors/api
```

## Prisma Generate

```bash
npm run prisma:generate -w @emotors/api
```

## Prisma Seed

```bash
npm run prisma:seed -w @emotors/api
```

Seed creates:

- Branch: Bishkek Main Branch (`BISHKEK`)
- Owner: `owner@emotors.kg`

## Run API

```bash
npm run dev -w @emotors/api
```

API runs on:

```txt
http://localhost:3001
```

## Run WEB

```bash
npm run dev -w @emotors/web
```

WEB runs on:

```txt
http://localhost:3000
```

## Required Commands

Run these after cloning or generating the project:

```bash
npm install
npm run prisma:migrate -w @emotors/api
npm run prisma:generate -w @emotors/api
npm run prisma:seed -w @emotors/api
npm run dev -w @emotors/api
npm run dev -w @emotors/web
```

## Default Credentials

```txt
Email: owner@emotors.kg
Password: password123
```

## Roles and Permissions

- OWNER: full access to all branches and modules
- MANAGER: CRM, Sales, Inventory, Service
- MASTER: Service only
- ACCOUNTANT: Finance only

Every business table includes `branchId`. The API enforces:

- OWNER can access all branches
- Other roles can access only records from their own branch

## Main API Routes

### Auth

- `POST /auth/login`
- `POST /auth/refresh`
- `POST /auth/logout`
- `GET /auth/me`

### Customers

- `POST /customers`
- `GET /customers`
- `GET /customers/:id`
- `PUT /customers/:id`
- `DELETE /customers/:id`
- `POST /customers/:id/events`
- `POST /customers/:id/follow-ups`
- `GET /customers/:id/timeline`

### Sales

- `POST /sales`
- `GET /sales`
- `GET /sales/:id`
- `POST /sales/:id/payments`
- `GET /sales/reports/daily`

### Service

- `POST /service`
- `GET /service`
- `GET /service/:id`
- `PUT /service/:id`
- `POST /service/:id/tasks`
- `POST /service/:id/warranties`

### Inventory

- `POST /inventory/products`
- `GET /inventory/products`
- `GET /inventory/products/:id`
- `PUT /inventory/products/:id`
- `POST /inventory/warehouses`
- `GET /inventory/warehouses`
- `POST /inventory/stock-movements`
- `GET /inventory/balances`
- `GET /inventory/low-stock`
- `GET /inventory/stock-value`
- `POST /inventory/yuan-rates`

### Finance

- `GET /finance/summary`
- `POST /finance/cashboxes`
- `GET /finance/cashboxes`
- `POST /finance/incomes`
- `POST /finance/expenses`
- `POST /finance/transactions`
- `GET /finance/transactions`
- `GET /finance/reports/debt`
- `GET /finance/reports/cashflow`
- `GET /finance/reports/profit`
- `GET /finance/reports/abc`
- `GET /finance/reports/xyz`
- `GET /finance/reports/margin`

### Users and Branches

- `GET /users`
- `POST /users`
- `PUT /users/:id`
- `GET /users/branches`
- `POST /users/branches`

## Troubleshooting

### TypeScript decorators

The API depends on NestJS decorators. Confirm these options exist in
`tsconfig.base.json` and `apps/api/tsconfig.json`:

```json
{
  "experimentalDecorators": true,
  "emitDecoratorMetadata": true,
  "noEmit": false
}
```

Also confirm TypeScript is pinned to `5.8.3`:

```bash
npm ls typescript
```

### PostgreSQL connection

If Prisma cannot connect:

1. Confirm PostgreSQL is running:
   ```bash
   docker compose ps
   ```
2. Confirm the URL matches:
   ```bash
   postgresql://postgres:postgres@localhost:5432/emotors?schema=public
   ```
3. Restart PostgreSQL:
   ```bash
   docker compose restart postgres
   ```

### Prisma errors

Regenerate the Prisma client after schema changes:

```bash
npm run prisma:generate -w @emotors/api
```

If the database is empty or missing tables:

```bash
npm run prisma:migrate -w @emotors/api
npm run prisma:seed -w @emotors/api
```

### Unauthorized errors

Protected API routes require:

```txt
Authorization: Bearer <access-token>
```

Login again at `/login` if the token is missing or expired.

### JWT issues

Make sure `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` exist in
`apps/api/.env`. If secrets change, log out and log in again.

### Port 3000 already in use

Stop the process using port 3000 or run WEB with another port:

```bash
lsof -i :3000
```

### Port 3001 already in use

Stop the process using port 3001 or change `PORT` in `apps/api/.env`:

```bash
lsof -i :3001
```

### `next` not found

Install workspace dependencies:

```bash
npm install
```

Then run:

```bash
npm run dev -w @emotors/web
```

### `class-validator` missing

Install dependencies from the monorepo root:

```bash
npm install
```

Confirm API dependencies:

```bash
npm ls class-validator class-transformer -w @emotors/api
```

### `dist/main.js` missing

Build the API:

```bash
npm run build -w @emotors/api
```

Expected output:

```txt
apps/api/dist/main.js
```