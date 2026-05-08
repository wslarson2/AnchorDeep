# AnchorDeep Scraper Deployment

## Overview

The scraper is deployed as a Docker Compose application with:
- **PostgreSQL** - persistent data storage
- **Redis** - job queue and caching
- **Scraper Service** - Node.js worker process

## Local Development

```bash
docker-compose up -d
```

Services start in order (postgres health check → redis health check → scraper).

## Production Deployment

### Via deploy-cli

From the Ala_Wai_Sluice project:

```bash
npm run dev -- deploy AnchorDeep scraper --to ala-wai-server-farm
```

Dry-run first to verify:
```bash
npm run dev -- deploy AnchorDeep scraper --to ala-wai-server-farm --dry-run
```

### Manual Deployment Steps

1. **SSH into server**
   ```bash
   ssh wlarson2@100.84.144.40
   ```

2. **Create deployment directory**
   ```bash
   mkdir -p /home/wlarson2/projects/AnchorDeep/scraper
   cd /home/wlarson2/projects/AnchorDeep/scraper
   ```

3. **Clone or copy AnchorDeep repo**
   ```bash
   git clone <repo-url> .
   ```

4. **Copy environment file**
   ```bash
   cp scraper/.env.production scraper/.env
   ```

5. **Build and start services**
   ```bash
   cd scraper
   docker-compose up -d
   ```

## Configuration

### Environment Variables

See `.env.production` for all settings. Key variables:

- `DATABASE_URL` - PostgreSQL connection string
- `REDIS_URL` - Redis connection string
- `API_BASE_URL` - API endpoint (defaults to localhost:3001)
- `INTERNAL_API_KEY` - Authentication key for API calls
- `EBAY_APP_ID` - Optional eBay API credentials
- `SCRAPE_ON_STARTUP` - Auto-start scraping on service startup

### Postgres Credentials

Default credentials (change in production):
- User: `postgres`
- Password: `postgres`
- Database: `anchordeep`

## Monitoring

### View logs
```bash
docker-compose logs -f scraper
```

### Check service status
```bash
docker-compose ps
```

### Health checks
All services have built-in health checks:
```bash
docker-compose ps
```

### Database backup
```bash
docker-compose exec postgres pg_dump -U postgres anchordeep > backup.sql
```

## Scaling

For production use, consider:
1. **Multiple scraper instances** - add replicas in docker-compose
2. **Separate Redis instance** - use external Redis for better performance
3. **Database backups** - implement automated backup strategy
4. **Log rotation** - already configured (10mb max, 3 files retained)

## Troubleshooting

### Scraper not connecting to database
```bash
docker-compose logs postgres
docker-compose logs scraper
```

### Redis connection issues
```bash
docker-compose exec redis redis-cli ping
```

### Rebuild and restart
```bash
docker-compose down
docker-compose up -d --build
```

## Access via Tailscale

All services are bound to `127.0.0.1` internally but accessible via Tailscale:
- **Tailscale IP**: 100.84.144.40
- **Postgres** (from other Tailscale clients): `100.84.144.40:5432`
- **Redis**: `100.84.144.40:6379`
