# Sales Pulse

**Sales Pulse** is an internal full-stack KPI tracking and lead management platform developed for in-house sales and revenue operations teams. The application centralizes lead management, sales activity tracking, and KPI reporting in a single internal system.

> **Note:** In the [React-Typescript-Web3](https://github.com/awaisahmadfg/React-Typescript-Web3) portfolio repo, this project lives under **`LeadSales/`**. The product name remains **Sales Pulse**.

This project is **proprietary** and intended strictly for **internal use**.

---

## Overview

Sales Pulse gives internal teams tools to manage leads, track outreach performance, and monitor sales KPIs in real time. The system supports bulk lead operations, spreadsheet-based lead ingestion, and structured reporting for management visibility.

The application is a **monolith** with a clear separation between frontend and backend responsibilities for maintainability and scalability.

---

## Key features

- Internal lead management with configurable statuses
- Bulk lead selection and bulk status updates
- KPI dashboards for internal performance tracking
- Spreadsheet upload and processing for lead ingestion
- REST-based API for internal system communication
- Cloud-ready architecture using PostgreSQL

---

## Tech stack

| Layer | Technologies |
|--------|----------------|
| **Frontend** | React, Vite, TypeScript |
| **Backend** | Node.js, Express.js, TypeScript |
| **Database** | PostgreSQL |
| **ORM** | Drizzle ORM |
| **Infrastructure** | AWS-compatible deployment, environment-based configuration, CI/CD workflows |

---

## Architecture overview

The system follows a logical **three-tier** architecture:

1. **Presentation** — React + Vite (`client/`)
2. **Application** — Node.js + Express (`server/`)
3. **Data** — PostgreSQL (via Drizzle)

The app is deployed as a single internal service while keeping clear boundaries between layers.

---

## Project structure

```text
LeadSales/                    # Sales Pulse (portfolio folder name)
├── client/                   # Frontend (Vite root)
│   ├── src/
│   └── index.html
├── server/                   # Backend
│   ├── main.ts               # Express entry
│   ├── routes/               # REST routes
│   ├── services/             # Domain services
│   ├── database/             # db.ts, storage.ts
│   └── config/               # env validation
├── shared/                   # Shared schemas and types
│   └── schema.ts
├── script/                   # Build, migrate, seed
├── migrations/               # Drizzle SQL migrations
├── vite.config.ts
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── README.md
```

---

## Database and ORM

Sales Pulse uses **PostgreSQL** with **Drizzle ORM** for type-safe database access.

- Standard PostgreSQL
- Strong typing via shared schemas (`shared/schema.ts`)
- Centralized database configuration
- Connections and secrets via environment variables

---

## Environment variables

Configuration is driven by environment variables. Create a local `.env` (never commit secrets).

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `PORT` | HTTP port (default `5000`) |
| `NODE_ENV` | `development` or `production` |
| `SESSION_SECRET` | Session signing secret (required in production) |

Example (development only — use placeholders, not real credentials):

```env
DATABASE_URL=postgresql://user:password@host/dbname
PORT=5000
NODE_ENV=development
SESSION_SECRET=change-me-in-production
```

Production must inject values through approved internal infrastructure (e.g. AWS environment configuration or a secrets manager).

---

## Local development setup

*For authorized internal developers only.*

### Prerequisites

- Node.js **18+**
- npm or yarn
- Access to an approved PostgreSQL database

### Setup

1. Clone the repository and open the `LeadSales/` directory.
2. Install dependencies: `npm install`
3. Configure environment variables per internal guidelines.

### Running the application

**Full stack (Express + Vite middleware):**

```bash
npm run dev
```

**Frontend only (Vite dev server, port 5000):**

```bash
npm run dev:client
```

**Typical local URLs**

| Service | URL |
|---------|-----|
| App (dev) | `http://localhost:5000` (default `PORT`) |
| API | Same origin under Express routes |

Database helpers:

```bash
npm run db:migrate
npm run db:seed
```

---

## Deployment on AWS

Sales Pulse is designed for internal AWS infrastructure.

**Supported models**

- AWS App Runner
- EC2 with managed process control
- ECS with Fargate

**Standards**

- Environment variables injected at runtime
- Database on PostgreSQL (e.g. AWS RDS)
- Access restricted to internal networks

---

## Security and access control

- Internal use only
- Access limited to authorized personnel
- Secrets via environment configuration (no secrets in git)
- API middleware and session auth as required
- Network isolation via VPC and security groups where applicable

---

## Maintenance and ownership

Owned and maintained by internal engineering and revenue operations teams. Changes follow internal review, approval, and deployment processes.

---

## License and usage

This software is **proprietary and confidential**. Unauthorized copying, redistribution, or external use is prohibited.

---

## PM2 deployment

After a production build:

```bash
npm run build
```

Process management:

```bash
pm2 start dist/index.cjs --name SalesPulse --env production
pm2 stop SalesPulse
pm2 restart SalesPulse
pm2 delete SalesPulse
pm2 list
pm2 logs SalesPulse
pm2 save
pm2 startup
```
