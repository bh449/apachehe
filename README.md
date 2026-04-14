# Mini ERP + WMS

A lightweight ERP and warehouse management system for small/home workshop businesses.  
Built on [InvenTree](https://inventree.org) with a custom barcode scanning workstation.

## Architecture

```
InvenTree (backend)  ←→  REST API  ←→  Scan Workstation (Next.js frontend)
     ↓
PostgreSQL + Redis
```

## Quick Start

### Prerequisites

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) installed and running
- Python 3.9+ (for initialization script)

### 1. Deploy InvenTree

```bash
cd inventree
./setup.sh
```

This will:
- Generate secure passwords
- Pull and start all containers
- Wait for InvenTree to be ready at **http://localhost:1880**

### 2. Initialize Data

```bash
pip install requests
python init-data.py
```

This seeds the system with:
- Warehouse location tree (Home > Rooms > Racks > Bins)
- Part categories (Raw Materials, Finished Goods, Packaging, etc.)
- Sample SKUs with barcodes
- Initial stock quantities

### 3. Start Using

1. Open http://localhost:1880
2. Log in with `admin` / (password from setup)
3. Try the barcode scanner in the web UI
4. Check Stock > Stock Items for inventory

## Project Structure

```
inventree/              InvenTree deployment
├── docker-compose.yml  Container orchestration
├── Caddyfile           Reverse proxy config
├── env-template.txt    Environment template (cp to .env)
├── setup.sh            One-click setup script
└── init-data.py        Data initialization script

scan-workstation/       Custom barcode scanning UI (Phase 2)
└── (Next.js app)
```

## Ports

| Service | Port |
|---------|------|
| InvenTree Web UI | http://localhost:1880 |
| InvenTree API | http://localhost:1880/api/ |
| PostgreSQL | 5432 (internal) |
| Redis | 6379 (internal) |

## API

InvenTree provides a full REST API with OpenAPI documentation:
- API Browser: http://localhost:1880/api/
- API Schema: http://localhost:1880/api/schema/

Authentication: Token-based (`Authorization: Token <your-token>`)

## Phases

- **Phase 1** - InvenTree deployment + data setup (current)
- **Phase 2** - Custom barcode scanning workstation (Next.js)
- **Phase 3** - Reports, alerts, API wrappers
- **Phase 4** - Purchase/Sales orders, BOM, label printing
