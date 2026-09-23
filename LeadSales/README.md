Sales Pulse
Sales Pulse is an internal full stack KPI tracking and lead management platform developed for in house sales and revenue operations teams. The application is designed to centralize lead management, sales activity tracking, and KPI reporting within a single internal system.
This project is proprietary and intended strictly for internal use.

Overview
Sales Pulse provides internal teams with tools to manage leads, track outreach performance, and monitor sales KPIs in real time. The system supports bulk lead operations, spreadsheet based lead ingestion, and structured reporting for management visibility.
The application is built as a monolithic system with a clear separation between frontend and backend responsibilities to ensure maintainability and scalability.

Key Features
	•	Internal lead management with configurable statuses
	•	Bulk lead selection and bulk status updates
	•	KPI dashboards for internal performance tracking
	•	Spreadsheet upload and processing for lead ingestion
	•	REST based API for internal system communication
	•	Cloud ready architecture using PostgreSQL

Tech Stack
Frontend
	•	React
	•	Vite
	•	TypeScript
Backend
	•	Node.js
	•	Express.js
	•	TypeScript
Database
	•	PostgreSQL
ORM
	•	Drizzle ORM
Infrastructure
	•	AWS compatible deployment
	•	Environment based configuration
	•	CI and CD enabled workflows

Architecture Overview
The system follows a logical three tier architecture.
	•	Frontend presentation layer built using React and Vite
	•	Backend application layer built using Node.js and Express
	•	Data layer powered by PostgreSQL
The application is deployed as a single internal service while maintaining clear logical boundaries between layers.

Project Structure
SalesPulse/
│
├── client/                 # Frontend app (Vite root is this folder)
│   ├── src/
│   └── index.html
│
├── server/                 # Backend application
│   ├── routes.ts
│   ├── storage.ts
│   ├── db.ts
│   └── index.ts
│
├── shared/                 # Shared schemas and types
│   └── schema.ts
│
├── script/                 # Build and migration scripts
├── migrations/             # Drizzle SQL migrations
├── vite.config.ts
├── drizzle.config.ts
├── package.json
├── tsconfig.json
└── README.md


Database and ORM
Sales Pulse uses PostgreSQL as the primary database with Drizzle ORM for type safe database interactions.
Key details:
	•	Standard PostgreSQL
	•	Strong typing enforced through shared schemas
	•	Centralized database configuration
	•	Secure connection handling via environment variables

Environment Variables
All configuration is managed using environment variables.
Required variables:
DATABASE_URL=postgresql://user:password@host/dbname
PORT=5000
NODE_ENV=development

Production environments must inject variables using approved internal infrastructure such as AWS environment configuration or a secrets manager.

Local Development Setup
This section is intended for authorized internal developers only.
Prerequisites
	•	Node.js version 18 or higher
	•	npm or yarn
	•	Access to an approved PostgreSQL database
Setup Steps
	•	Ensure access permissions to the internal repository
	•	Install dependencies using the approved package manager
	•	Configure environment variables according to internal guidelines

Running the Application
Backend
npm run dev:server

Frontend
npm run dev:client

Internal access URLs:
	•	Frontend: http://localhost:5173
	•	Backend API: http://localhost:5000

Deployment on AWS
Sales Pulse is deployed using internal AWS infrastructure.
Supported deployment models include:
	•	AWS App Runner
	•	EC2 with managed process control
	•	ECS with Fargate
Deployment standards:
	•	Environment variables injected at runtime
	•	Database hosted on PostgreSQL (for example AWS RDS)
	•	Access restricted to internal networks

Security and Access Control
	•	This system is for internal use only
	•	Access is restricted to authorized personnel
	•	Secrets are managed via environment configuration
	•	API access controls and middleware can be enforced as required
	•	Network access can be restricted using VPC and security groups

Maintenance and Ownership
This project is owned and maintained by the internal engineering and revenue operations teams.
All changes must follow internal review, approval, and deployment processes.

License and Usage
This software is proprietary and confidential.
Unauthorized copying, redistribution, or external use is strictly prohibited.

PM2 Deployment Commands
Use these commands after running `npm run build`:

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

