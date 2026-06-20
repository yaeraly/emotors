# EMOTORS OS - Phase 1 CRM

EMOTORS OS is a business management system for an electric tricycle parts, repair, and sales company in Kyrgyzstan.

This repository currently implements only the stable foundation and Phase 1 CRM module:

- Login with JWT
- Users and roles
- Branches
- Customers
- Customer history and timeline
- WhatsApp communication history
- Follow-up tasks

Sales, Service, Inventory, Finance, Academy, Franchise, China Procurement, and AI modules are intentionally not implemented yet.

## Project structure

```text
root/
├── apps/
│   ├── api/
│   └── web/
├── package.json
├── tsconfig.base.json
└── README.md
```

## Requirements

- Node.js and npm
- PostgreSQL

The API runs on `http://localhost:3001`.
The web app runs on `http://localhost:3000`.

## Setup

Run every command from the project root unless a command explicitly says otherwise.

### 1. Install dependencies

```bash
npm install --include=optional
```

The `--include=optional` flag ensures the Linux x64 Next.js SWC binary is installed.

### 2. Create env files

```bash
cp apps/api/.env.example apps/api/.env
cp apps/web/.env.local.example apps/web/.env.local
```

### 3. Create database manually if needed

```bash
sudo -u postgres createdb emotors
```

### 4. Generate Prisma Client

```bash
npx prisma generate --schema apps/api/prisma/schema.prisma
```

### 5. Run migration

```bash
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name init
```

Do not use `--force-reset` with `migrate dev`.

### 6. Run seed

```bash
npm run prisma:seed -w @emotors/api
```

### 7. Run API

```bash
npm run dev -w @emotors/api
```

### 8. Run WEB

In a second terminal:

```bash
npm run dev -w @emotors/web
```

## Default login

```text
Email: owner@emotors.kg
Password: password123
Role: OWNER
```

## Useful root commands

```bash
npm run dev
npm run build
npm run prisma:generate
npm run prisma:migrate
npm run prisma:seed
```

## API routes

- `POST /auth/login`
- `GET /auth/me`
- `GET /branches`
- `GET /customers`
- `POST /customers`
- `GET /customers/:id`
- `PUT /customers/:id`
- `DELETE /customers/:id`
- `POST /customers/:id/events`
- `POST /customers/:id/follow-ups`
- `PUT /customers/:id/follow-ups/:followUpId/done`
- `GET /customers/:id/timeline`

## Implemented roles

- `OWNER`: can access all branches and CRM records.
- `MANAGER`: can access CRM records only for their branch.
- `MASTER`: cannot access CRM.
- `ACCOUNTANT`: cannot access CRM.

## Troubleshooting

### npm must be run from project root

If npm cannot find a workspace, make sure your terminal is in the repository root:

```bash
pwd
npm run dev -w @emotors/api
```

### npm version warning

If npm prints an engine or version warning, update npm and retry:

```bash
npm install -g npm@latest
npm install --include=optional
```

### PostgreSQL not running

Start PostgreSQL, then retry migration:

```bash
sudo service postgresql start
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name init
```

### DATABASE_URL missing

Create `apps/api/.env` from the example:

```bash
cp apps/api/.env.example apps/api/.env
```

Confirm it contains:

```text
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/emotors?schema=public"
```

### Prisma migrate reset

If the local database is broken and you are okay deleting local data:

```bash
npx prisma migrate reset --schema apps/api/prisma/schema.prisma
```

Then run the seed again:

```bash
npm run prisma:seed -w @emotors/api
```

### public.User table does not exist

Run migration and seed:

```bash
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name init
npm run prisma:seed -w @emotors/api
```

### public.Branch table does not exist

Run migration and seed:

```bash
npx prisma migrate dev --schema apps/api/prisma/schema.prisma --name init
npm run prisma:seed -w @emotors/api
```

### Next SWC binary missing

Reinstall dependencies with optional packages:

```bash
rm -rf node_modules apps/web/.next package-lock.json
npm install --include=optional
```

### port 3000 already in use

Stop the existing process or run:

```bash
lsof -ti :3000
```

Then kill the process if it is safe to do so.

### port 3001 already in use

Stop the existing process or run:

```bash
lsof -ti :3001
```

Then kill the process if it is safe to do so.

### NetworkError in browser

Check that:

- API is running on `http://localhost:3001`
- Web app has `NEXT_PUBLIC_API_URL="http://localhost:3001"` in `apps/web/.env.local`
- API CORS has `WEB_ORIGIN="http://localhost:3000"` in `apps/api/.env`

### Unauthorized login

Confirm the database was seeded:

```bash
npm run prisma:seed -w @emotors/api
```

Then login with:

```text
owner@emotors.kg
password123
```