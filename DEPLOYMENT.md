# AnchorDeep Production Deployment Guide

## Quick Start

### Prerequisites
- Tailscale running on your device
- SSH key: `~/.ssh/id_ed25519`
- Server access: `ssh wlarson2@100.84.144.40`

### One-Command Deployment

```bash
./scripts/deploy.sh
```

That's it! The script handles everything:
- ✅ SSH into server
- ✅ Clone/pull repository
- ✅ Open firewall ports (5173, 3001, 3030)
- ✅ Build Docker images
- ✅ Start services
- ✅ Run database migrations

**Dry-run first to verify:**
```bash
./scripts/deploy.sh --dry-run
```

---

## Manual Deployment Steps

If you prefer to deploy manually or need to debug:

### 1. SSH into Server
```bash
ssh wlarson2@100.84.144.40
```

### 2. Create Project Directory
```bash
mkdir -p /home/wlarson2/projects/AnchorDeep
cd /home/wlarson2/projects/AnchorDeep
```

### 3. Clone Repository
```bash
git clone https://github.com/wslarson2/AnchorDeep.git .
```

### 4. Set Up Environment File

**Option A: Copy from local**
```bash
scp .env.production wlarson2@100.84.144.40:/home/wlarson2/projects/AnchorDeep/.env.production
```

**Option B: Create on server**
```bash
ssh wlarson2@100.84.144.40
cd /home/wlarson2/projects/AnchorDeep
nano .env.production
# Paste content from .env.production template
# Edit with your secrets
```

**Required secrets:**
- `DB_PASSWORD`: Strong password for PostgreSQL
- `INTERNAL_API_KEY`: 32-character hex string for API authentication
- `AUTH0_DOMAIN`: Your Auth0 tenant domain
- `AUTH0_AUDIENCE`: Your Auth0 API audience

### 5. Open Firewall Ports
```bash
sudo ufw allow 5173/tcp comment "AnchorDeep App"
sudo ufw allow 3001/tcp comment "AnchorDeep API"
sudo ufw allow 3030/tcp comment "AnchorDeep Bull Board"
```

### 6. Build and Start Services
```bash
cd /home/wlarson2/projects/AnchorDeep
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.prod.yml ps
```

### 7. Run Database Migrations
```bash
docker-compose -f docker-compose.prod.yml exec api npm run db:migrate:prod
```

---

## Access Your Application

Once deployed, access via Tailscale at:

- **Web App**: http://100.84.144.40:5173
- **API**: http://100.84.144.40:3001
- **API Docs**: http://100.84.144.40:3001/docs
- **Bull Board** (job queue UI): http://100.84.144.40:3030

---

## Service Details

### Docker Compose Services

**docker-compose.prod.yml** contains:

| Service | Port | Purpose |
|---------|------|---------|
| `postgres` | 5432 | Database (internal only) |
| `redis` | 6379 | Cache & job queue (internal only) |
| `api` | 3001 | Fastify API |
| `app` | 5173 | React frontend (nginx) |
| `scraper` | — | Background job processor |
| `bull-board` | 3030 | Job queue monitoring UI |

### Environment Variables

All services read from `.env.production`:

```bash
# Database
DB_USER=postgres
DB_PASSWORD=YOUR_STRONG_PASSWORD_HERE
DB_NAME=anchordeep

# Auth0
AUTH0_DOMAIN=your-tenant.auth0.com
AUTH0_AUDIENCE=https://api.anchordeep.com

# Security
INTERNAL_API_KEY=YOUR_32_CHAR_HEX_STRING_HERE

# Scraper
SCRAPE_ON_STARTUP=false
```

---

## Common Operations

### View Logs
```bash
# All services
docker-compose -f docker-compose.prod.yml logs -f

# Specific service
docker-compose -f docker-compose.prod.yml logs -f api
docker-compose -f docker-compose.prod.yml logs -f app
docker-compose -f docker-compose.prod.yml logs -f scraper
```

### Restart Services
```bash
docker-compose -f docker-compose.prod.yml restart
docker-compose -f docker-compose.prod.yml restart api
```

### Stop Services
```bash
docker-compose -f docker-compose.prod.yml down
```

### Check Service Health
```bash
docker-compose -f docker-compose.prod.yml ps
```

### Database Backup
```bash
docker-compose -f docker-compose.prod.yml exec postgres pg_dump -U postgres anchordeep > backup.sql
```

### Database Shell
```bash
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -d anchordeep
```

### Redis CLI
```bash
docker-compose -f docker-compose.prod.yml exec redis redis-cli
```

---

## Troubleshooting

### Services won't start
```bash
# Check logs for specific service
docker-compose -f docker-compose.prod.yml logs api

# Rebuild images
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d --build
```

### Database migration fails
```bash
# Check database connection
docker-compose -f docker-compose.prod.yml exec postgres psql -U postgres -c "SELECT 1"

# Try manual migration
docker-compose -f docker-compose.prod.yml exec api npm run db:migrate:prod
```

### Can't access from Tailscale
- Verify Tailscale is running on your device
- Check firewall rules: `sudo ufw status`
- Ping server: `ping 100.84.144.40`
- SSH works but ports blocked? Re-run firewall setup

### Port already in use
```bash
# Check what's using the port
sudo lsof -i :3001

# Kill and restart
docker-compose -f docker-compose.prod.yml down
docker-compose -f docker-compose.prod.yml up -d
```

---

## Server Specs (for reference)

- **IP**: 100.84.144.40 (via Tailscale)
- **CPU**: i7-9750H (6c/12t)
- **GPU**: GTX 1650 4GB
- **RAM**: 16GB (~11GB available after LLM models)
- **Disk**: 441GB available
- **Docker**: 29.4.2 + Compose
- **Local LLM APIs** (for future use):
  - Fast: http://127.0.0.1:8080/v1 (Qwen3 4B, GPU)
  - Smart: http://127.0.0.1:8081/v1 (Qwen3 8B, CPU)

---

## Future: LLM Integration

When ready to integrate the local LLM APIs:

1. Update environment variables in `.env.production`:
   ```bash
   OPENAI_API_BASE=http://host.docker.internal:8080/v1
   ```

2. Use in your API code:
   ```typescript
   const response = await fetch(`${process.env.OPENAI_API_BASE}/chat/completions`, {
     headers: { 'Authorization': 'Bearer dummy' }
   })
   ```

---

## Updates & Redeployment

To pull latest changes and redeploy:

```bash
cd /home/wlarson2/projects/AnchorDeep
git pull origin main
docker-compose -f docker-compose.prod.yml up -d --build
docker-compose -f docker-compose.prod.yml exec api npm run db:migrate:prod
```

Or use the deploy script:
```bash
./scripts/deploy.sh
```
