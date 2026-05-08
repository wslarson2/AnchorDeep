#!/bin/bash
set -e

# AnchorDeep Deployment Script
# Usage: ./deploy.sh [--dry-run]
# Output saved to: ./deploy-$(date +%s).log

LOG_FILE="./deploy-$(date +%s).log"
exec > >(tee -a "$LOG_FILE")
exec 2>&1

DRY_RUN=false
SERVER_USER="wlarson2"
SERVER_HOST="100.84.144.40"
SERVER_IP="100.84.144.40"
PROJECT_DIR="/home/wlarson2/projects/AnchorDeep"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Parse arguments
for arg in "$@"; do
  case $arg in
    --dry-run)
      DRY_RUN=true
      shift
      ;;
  esac
done

log_info() {
  echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
  echo -e "${RED}[ERROR]${NC} $1"
}

log_info "AnchorDeep Deployment Script"
log_info "Server: $SERVER_HOST"
log_info "Project Directory: $PROJECT_DIR"

if [ "$DRY_RUN" = true ]; then
  log_warn "Running in DRY-RUN mode (no changes will be made)"
fi

# Step 1: SSH connection test
log_info "Step 1: Testing SSH connection..."
if ! ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no "$SERVER_USER@$SERVER_HOST" "echo 'SSH connection OK'" >/dev/null 2>&1; then
  log_error "Failed to connect to server via SSH"
  log_error "Make sure:"
  log_error "1. Tailscale is running on your device"
  log_error "2. SSH key at ~/.ssh/id_ed25519 is valid"
  log_error "3. You can ping $SERVER_HOST"
  exit 1
fi
log_info "SSH connection successful"

# Step 2: Prepare server directory
log_info "Step 2: Preparing server directory..."
PREPARE_CMD="
  mkdir -p $PROJECT_DIR
  cd $PROJECT_DIR
  pwd
"
if [ "$DRY_RUN" = true ]; then
  log_warn "Would execute: mkdir and cd to $PROJECT_DIR"
else
  ssh "$SERVER_USER@$SERVER_HOST" "$PREPARE_CMD"
fi

# Step 3: Clone or pull repository
log_info "Step 3: Cloning/pulling repository..."
GIT_CMD="
  cd $PROJECT_DIR
  if [ -d '.git' ]; then
    rm -f .env.production docker-compose.prod.yml
    git pull origin main
  else
    rm -rf * .env.production docker-compose.prod.yml
    git clone https://github.com/wslarson2/AnchorDeep.git .
  fi
"
if [ "$DRY_RUN" = true ]; then
  log_warn "Would execute git clone/pull"
else
  ssh "$SERVER_USER@$SERVER_HOST" "$GIT_CMD"
fi

# Step 4: Copy config files (after git pull so they don't conflict)
log_info "Step 4: Copying config files..."
if [ "$DRY_RUN" = true ]; then
  log_warn "Would copy .env.production and docker-compose.prod.yml to server"
else
  if [ ! -f ".env.production" ]; then
    log_error ".env.production not found locally!"
    log_error "Create it first: cp .env.example .env.production && nano .env.production"
    exit 1
  fi
  if [ ! -f "docker-compose.prod.yml" ]; then
    log_error "docker-compose.prod.yml not found locally!"
    exit 1
  fi
  scp -o StrictHostKeyChecking=no ".env.production" "$SERVER_USER@$SERVER_HOST:$PROJECT_DIR/.env.production"
  scp -o StrictHostKeyChecking=no "docker-compose.prod.yml" "$SERVER_USER@$SERVER_HOST:$PROJECT_DIR/docker-compose.prod.yml"
  log_info "Config files copied successfully"
fi

# Step 5: Open firewall ports
log_info "Step 5: Opening firewall ports..."
UFW_CMD="
  sudo -n ufw allow 5173/tcp comment 'AnchorDeep App' || true
  sudo -n ufw allow 3001/tcp comment 'AnchorDeep API' || true
  sudo -n ufw allow 3030/tcp comment 'AnchorDeep Bull Board' || true
  echo 'Firewall rules updated (or already exist)'
"
if [ "$DRY_RUN" = true ]; then
  log_warn "Would open ports: 5173, 3001, 3030"
else
  ssh "$SERVER_USER@$SERVER_HOST" "$UFW_CMD"
fi

# Step 6: Build and start services
log_info "Step 6: Building and starting Docker services..."
DOCKER_CMD="
  cd $PROJECT_DIR
  docker compose -f docker-compose.prod.yml --env-file .env.production down || true
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
  docker compose -f docker-compose.prod.yml --env-file .env.production ps
"
if [ "$DRY_RUN" = true ]; then
  log_warn "Would build and start Docker services"
else
  ssh "$SERVER_USER@$SERVER_HOST" "$DOCKER_CMD"
fi

# Step 7: Run database migrations
log_info "Step 7: Running database migrations..."
MIGRATE_CMD="
  cd $PROJECT_DIR
  docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api npm run db:migrate:prod
"
if [ "$DRY_RUN" = true ]; then
  log_warn "Would run: npm run db:migrate:prod"
else
  log_warn "Waiting for API container to be ready..."
  sleep 5
  if ssh "$SERVER_USER@$SERVER_HOST" $MIGRATE_CMD 2>&1; then
    log_info "Database migrations completed"
  else
    log_warn "Database migrations may have failed or already applied"
  fi
fi

# Step 8: Summary
log_info ""
log_info "========================================"
log_info "Deployment Complete!"
log_info "========================================"
log_info ""
log_info "Access your application at:"
log_info "  App:       http://$SERVER_IP:5173"
log_info "  API:       http://$SERVER_IP:3001"
log_info "  Bull Board: http://$SERVER_IP:3030"
log_info ""
log_info "Useful commands:"
log_info "  SSH into server:"
log_info "    ssh $SERVER_USER@$SERVER_HOST"
log_info ""
log_info "  View logs:"
log_info "    docker compose -f docker-compose.prod.yml logs -f [service-name]"
log_info ""
log_info "  Restart services:"
log_info "    docker compose -f docker-compose.prod.yml restart"
log_info ""
log_info "  Stop services:"
log_info "    docker compose -f docker-compose.prod.yml down"
log_info ""
log_info "Full log saved to: $LOG_FILE"
log_info ""
