# Xinyue AI

Xinyue AI is a private commercial AI workspace containing a user application,
an administration console, and a NestJS API service.

## Stack

- User application: Vue 3, TypeScript, Vite, Pinia
- Administration: Art Design Pro, Vue 3, Element Plus
- API: NestJS, Fastify, Prisma, PostgreSQL, Redis, BullMQ

## Requirements

- Node.js 20.19 or newer
- npm
- pnpm 8.8 or newer
- Docker Desktop or local PostgreSQL 17 and Redis 7 services

## First-time installation wizard

The application includes a browser-based installation wizard for a new
deployment. It tests PostgreSQL and Redis, applies Prisma migrations, saves the
site identity, and creates the first super administrator.

1. Install dependencies and start PostgreSQL/Redis:

```powershell
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
docker compose up -d
```

2. Start the API and frontend without creating `server/.env`:

```powershell
npm run server:dev
npm run dev
```

3. Open `http://localhost:5173/install`. Read the one-time installation key
   from the API terminal, then complete the three wizard steps.

4. Restart the API when the wizard finishes. The installer is locked as soon
   as an active administrator exists.

The wizard writes secrets only to `server/.env`, which is ignored by Git. In
Docker production deployments, `docker-compose.prod.yml` stores the generated
runtime configuration in the `xinyue_config` volume. Back up that volume with
the PostgreSQL data and uploads. Set `INSTALL_TOKEN` in the deployment
environment when a fixed installation key is preferred over the generated key.

For a production Docker deployment, create the Compose environment file and
replace `POSTGRES_PASSWORD` before starting the services:

```powershell
Copy-Item .env.production.example .env.production
docker compose --env-file .env.production -f docker-compose.prod.yml up -d --build
docker compose --env-file .env.production -f docker-compose.prod.yml logs backend
```

Open the site `/install` path. Use
`postgresql://flux:<POSTGRES_PASSWORD>@postgres:5432/flux_studio` for
PostgreSQL and `redis://redis:6379` for Redis. The generated runtime
configuration is stored in the `xinyue_config` volume and takes precedence
over blank example values.

## Manual local setup

1. Install dependencies:

```powershell
npm ci
npm --prefix server ci
pnpm --dir admin install --frozen-lockfile
```

2. Start PostgreSQL and Redis:

```powershell
docker compose up -d
```

3. Create the backend environment file (skip this step when using the wizard):

```powershell
Copy-Item server/.env.example server/.env
```

Replace `SESSION_SECRET`, `CREDENTIAL_ENCRYPTION_KEY`, `ADMIN_EMAIL`, and
`ADMIN_PASSWORD` before sharing or deploying an environment.

4. Prepare the database manually:

```powershell
npm --prefix server run prisma:generate
npm --prefix server run prisma:deploy
npm --prefix server run admin:seed
```

5. Start the three applications in separate terminals:

```powershell
npm run dev
npm run server:dev
npm run admin:dev
```

Local addresses:

- User application: `http://localhost:5173`
- Administration: `http://localhost:5174/admin/`
- API: `http://localhost:3100/v1`

## Build

```powershell
npm run build
npm run server:build
npm run admin:build
```

## Collaboration

Do not commit directly to `main`. Create a feature branch and open a pull
request. See [CONTRIBUTING.md](CONTRIBUTING.md) for the expected workflow.

Runtime `.env` files, generated output, logs, databases, and user uploads are
excluded from source control. Never add credentials to commits or pull request
descriptions.

## Third-party software

Third-party notices and retained licenses are listed in
[THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).
