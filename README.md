# AnchorDeep

[![CI](https://github.com/wslarson2/anchordeep/actions/workflows/ci.yml/badge.svg)](https://github.com/wslarson2/anchordeep/actions)

> **Find your next catamaran.** Multi-source marketplace aggregator with intelligent deduplication, price history, and alerts.

AnchorDeep is a full-stack web application that aggregates catamaran listings from multiple online marketplaces, deduplicates them using intelligent fingerprinting, tracks price history, and lets you save favorites and set price alerts. Built with TypeScript, Fastify, React, and PostgreSQL — deployed as a containerized microservices stack.

## Features

✨ **Multi-Source Scraping** — Aggregates listings from BoatTrader, YachtWorld, boats.com, Craigslist, and eBay Motors

🎯 **Intelligent Deduplication** — SHA-256 fingerprinting across sites ensures you see each boat once, not five times

📊 **Price History Tracking** — Append-only snapshots let you see price trends over time, detect drops, and spot relists

❤️ **Saved Listings** — Bookmark boats you like

🚨 **Price Alerts** — Get notified when a boat drops below your target price

🔐 **Secure Auth** — Auth0 integration with optional dev-mode passthrough

⚡ **Fast Search** — React frontend with TanStack Query, Zustand, and Tailwind CSS

## Tech Stack

![TypeScript](https://img.shields.io/badge/TypeScript-5.7-3178C6?logo=typescript&logoColor=white)
![Fastify](https://img.shields.io/badge/Fastify-4.28-000000?logo=fastify)
![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)
![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-316192?logo=postgresql&logoColor=white)
![Turborepo](https://img.shields.io/badge/Turborepo-2.0-EF4444?logo=turborepo)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)

- **API**: Fastify, Prisma ORM, Zod validation
- **Frontend**: React 19, Vite, TanStack Query, Zustand, Tailwind CSS
- **Scraper**: Playwright, Cheerio, BullMQ, TypeScript
- **Database**: PostgreSQL with Prisma, 10 models with optimized indexes
- **Queue**: BullMQ with Redis
- **Infra**: Turborepo monorepo, Docker Compose

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     React Frontend (Vite)                   │
│              Search • Filter • Alerts • Saved               │
└────────────────────────┬────────────────────────────────────┘
                         │ HTTP
┌────────────────────────▼────────────────────────────────────┐
│                   Fastify API Server                        │
│  /listings  /me  /analytics  /internal (scraper ingest)    │
└──────────┬──────────────────────────────────────────┬───────┘
           │                                          │
      PostgreSQL                                  BullMQ + Redis
      + Prisma ORM                                Job Scheduler
           │                                          │
           └──────────────┬──────────────────────────┘
                          │
        ┌─────────────────┼─────────────────┐
        │                 │                 │
    ┌───▼──┐         ┌────▼────┐       ┌───▼──┐
    │Search│         │  Detail  │ ...   │Other │
    │Worker│         │  Worker  │       │Sites │
    └───┬──┘         └────┬─────┘       └──────┘
        │                 │
        └─────────────────┼──────────────────────┐
                          │                      │
                    ┌─────▼──────┐        ┌──────▼─────┐
                    │ BoatTrader  │ ...    │   eBay     │
                    │ YachtWorld  │        │   Motors   │
                    └─────────────┘        └────────────┘
```

**Search Pipeline**: Each scraper runs every 6 hours via cron. The `search` worker fetches listing URLs, checks staleness via API, enqueues stale URLs to the `detail` worker. The `detail` worker scrapes individual pages, normalizes data, filters for target makes, and POSTs snapshots to `/api/v1/internal/snapshots`.

**Deduplication**: The API fingerprints each listing (SHA-256 hash of make, model, year, length, state). If a fingerprint already exists, the listing is treated as a cross-site duplicate, and only the price snapshot is updated.

## Quick Start (Docker Compose)

### Prerequisites
- Docker & Docker Compose
- `.env` file with required variables (see `.env.example`)

### Run

```bash
# Copy environment template
cp .env.example .env

# Bring up the stack (postgres, redis, api, scraper, app)
docker compose up

# Seed the database with sample data (in another terminal)
docker compose exec api npm run db:seed

# Open http://localhost:5173 in your browser
```

That's it. The API will run migrations automatically on startup.

## Manual Setup (Development)

### Prerequisites
- Node.js 18+
- PostgreSQL 14+
- Redis 6+

### Installation

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your database, Redis, and Auth0 credentials

# Generate Prisma client and run migrations
npm run db:generate
npm run db:migrate

# Seed the database (optional)
npm run db:seed
```

### Running Services

```bash
# Terminal 1: API server (http://localhost:3000)
cd api
npm run dev

# Terminal 2: Frontend (http://localhost:5173)
cd app
npm run dev

# Terminal 3: Scraper (enqueues jobs to BullMQ)
cd scraper
npm run dev

# Terminal 4: Monitor BullMQ jobs
cd api
npm run db:studio  # or use a Redis GUI like RedisInsight
```

## API Reference

### Public Endpoints
- `GET /api/v1/listings` — Search listings with filters and pagination
- `GET /api/v1/listings/:id` — Get full listing details with price history
- `GET /api/v1/analytics/market-summary` — Market overview (count, price stats)
- `GET /api/v1/analytics/price-trends` — Price trends by make/year

### Authenticated Endpoints (Auth0)
- `GET /api/v1/me/saved-listings` — Your saved listings
- `POST /api/v1/me/saved-listings` — Save a listing
- `DELETE /api/v1/me/saved-listings/:id` — Remove a saved listing
- `GET /api/v1/me/alerts` — Your price alerts
- `POST /api/v1/me/alerts` — Create a price alert
- `PATCH /api/v1/me/alerts/:id` — Update an alert

### Internal Endpoints (API Key)
- `POST /api/v1/internal/snapshots` — Ingest scraped listing snapshots

**Full API docs**: Run the stack and visit `http://localhost:3000/docs` (Swagger UI).

## Environment Variables

```env
# Database
DATABASE_URL=postgresql://user:password@localhost:5432/anchordeep

# Cache & Job Queue
REDIS_URL=redis://localhost:6379

# Auth0
AUTH0_DOMAIN=your-domain.auth0.com
AUTH0_AUDIENCE=https://api.anchordeep.local
INTERNAL_API_KEY=your-secret-api-key-for-scraper

# eBay (optional; disables eBay scraper if absent)
EBAY_APP_ID=your-ebay-app-id

# Optional
PROXY_URL=http://proxy:8080  # For Playwright if behind a proxy
NODE_ENV=development
```

See `.env.example` for all options.

## Development

### Project Structure

```
anchordeep/
├── api/                    # Fastify backend
│   ├── src/
│   │   ├── server.ts       # App bootstrap
│   │   ├── plugins/        # Auth, middleware
│   │   ├── routes/         # Endpoint handlers
│   │   ├── services/       # Business logic
│   │   └── lib/            # Utilities
│   └── prisma/
│       ├── schema.prisma   # Database schema
│       └── migrations/     # Schema history
├── app/                    # React frontend
│   └── src/
│       ├── pages/          # Route pages
│       ├── components/     # React components
│       ├── store/          # Zustand state
│       ├── hooks/          # Custom hooks
│       └── lib/            # API client, types
├── scraper/                # Web scraper orchestrator
│   └── src/
│       ├── scrapers/       # Site-specific scrapers
│       ├── workers/        # BullMQ job handlers
│       ├── pipeline/       # Data normalization
│       └── lib/            # Browser pool, rate limiter, queue
├── packages/shared/        # Shared types & constants
│   └── src/
│       ├── types/
│       └── constants/
├── turbo.json              # Turborepo config
├── docker-compose.yml      # Full-stack local dev
└── README.md               # This file
```

### Scripts

```bash
# Root (Turborepo)
npm run dev              # All services in dev mode
npm run build            # Build all packages
npm run type-check       # TypeScript check
npm run lint             # ESLint

# API
cd api
npm run dev              # Fastify with auto-reload
npm run build            # Compile to dist/
npm run db:migrate       # Apply pending migrations
npm run db:seed          # Populate sample data
npm run db:studio        # Open Prisma Studio

# App (Frontend)
cd app
npm run dev              # Vite dev server
npm run build            # Production build
npm run preview          # Preview production build

# Scraper
cd scraper
npm run dev              # Start scraper + workers
npm run test-single      # Test scrape one URL
```

## Known Limitations & Roadmap

### Current Limitations
- **Alert Notifications**: Alerts are stored but email delivery is not yet wired up
- **Facebook Marketplace**: Enumerated in the scraper but not implemented (requires session auth)
- **Map View**: Database has lat/lng but UI doesn't render a map yet
- **Make/Model Search**: API supports filtering by make/model but no UI search input exists yet

### Roadmap
- [ ] Email notifications on price alerts
- [ ] Map view for geographic browsing
- [ ] Facebook Marketplace scraper with session management
- [ ] Make/Model typeahead search
- [ ] User preferences (saved searches, notification frequency)
- [ ] Comparative price trends (show which site has the best price)

## Database Schema

**Core Models**:
- `Listing` — Canonical boat record with cross-site dedup fingerprint
- `ListingSource` — Links to external listings; tracks scrape health
- `PriceSnapshot` — Append-only price history with change percentage
- `ListingSpec` — Flexible specs (engine hours, berths, draft, etc.) as EAV
- `ListingImage` — Ordered images with thumbnail flag

**User Features**:
- `User` — Auth0-backed user records
- `SavedListing` — Composite unique (userId, listingId)
- `PriceAlert` — Tracks watched boats and notification status

**Audit**:
- `ScrapeRun` — Per-run counters (new, updated, sold, errors)
- `SpecKey` — Reference data for flexible spec storage

See `api/prisma/schema.prisma` for the full schema.

## Deployment

A `docker-compose.prod.yml` is configured for production deployments. See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed instructions.

## Contributing

This is a portfolio project. If you find bugs or have suggestions:
1. Open an issue with a clear description
2. If submitting code, ensure `npm run type-check` and `npm run lint` pass
3. Add tests for new features

## License

MIT

## Author

Built by [wslarson2](https://github.com/wslarson2).

**Development tooling**: This project was developed with modern AI-assisted coding tools (Claude) for scaffolding, code review, and quality improvements. The architecture, feature decisions, bug fixes, and all engineering choices are my own.

---

**Happy boat hunting!** ⛵
