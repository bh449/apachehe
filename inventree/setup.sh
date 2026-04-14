#!/bin/bash
# ============================================================
# InvenTree Quick Setup Script
# ============================================================
# Usage: ./setup.sh
# This script:
#   1. Copies env-template.txt to .env (if not exists)
#   2. Generates secure random passwords
#   3. Starts all containers
#   4. Waits for InvenTree to be ready
# ============================================================

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

echo "=== InvenTree Mini ERP + WMS Setup ==="
echo ""

# Step 1: Create .env from template
if [ -f .env ]; then
    echo "[OK] .env already exists, skipping creation"
else
    echo "[..] Creating .env from template..."
    cp env-template.txt .env

    # Generate random passwords
    DB_PASS=$(openssl rand -base64 24 | tr -dc 'a-zA-Z0-9' | head -c 24)
    ADMIN_PASS=$(openssl rand -base64 16 | tr -dc 'a-zA-Z0-9' | head -c 16)

    # Replace placeholder passwords
    if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s/CHANGE_ME_to_a_strong_password/$DB_PASS/" .env
        sed -i '' "s/CHANGE_ME_admin_password/$ADMIN_PASS/" .env
    else
        sed -i "s/CHANGE_ME_to_a_strong_password/$DB_PASS/" .env
        sed -i "s/CHANGE_ME_admin_password/$ADMIN_PASS/" .env
    fi

    echo "[OK] .env created with secure passwords"
    echo ""
    echo "  Admin user:     admin"
    echo "  Admin password: $ADMIN_PASS"
    echo ""
    echo "  >>> SAVE THIS PASSWORD! It won't be shown again. <<<"
    echo ""
fi

# Step 2: Check Docker
if ! command -v docker &> /dev/null; then
    echo "[ERROR] Docker is not installed. Please install Docker Desktop first."
    echo "  https://www.docker.com/products/docker-desktop/"
    exit 1
fi

if ! docker info &> /dev/null; then
    echo "[ERROR] Docker daemon is not running. Please start Docker Desktop."
    exit 1
fi

echo "[OK] Docker is running"

# Step 3: Start containers
echo "[..] Pulling images and starting containers..."
docker compose up -d

# Step 4: Wait for InvenTree to be ready
echo "[..] Waiting for InvenTree to initialize (this may take 1-2 minutes on first run)..."
MAX_WAIT=180
ELAPSED=0
while [ $ELAPSED -lt $MAX_WAIT ]; do
    if curl -s -o /dev/null -w "%{http_code}" http://localhost:1880 2>/dev/null | grep -q "200\|301\|302"; then
        echo ""
        echo "============================================"
        echo "  InvenTree is ready!"
        echo ""
        echo "  URL:      http://localhost:1880"
        echo "  Username: admin"
        echo "  Password: (see above or check .env)"
        echo "============================================"
        exit 0
    fi
    sleep 5
    ELAPSED=$((ELAPSED + 5))
    printf "."
done

echo ""
echo "[WARN] InvenTree did not respond within ${MAX_WAIT}s."
echo "  Check logs: docker compose logs inventree-server"
echo "  It may still be initializing. Try http://localhost:1880 in a few minutes."
