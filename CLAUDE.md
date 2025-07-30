# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a Telegram mini app roulette game where users can buy gifts with TON cryptocurrency and use them as bets in a roulette system. The project consists of a React frontend, Node.js/Express backend, PostgreSQL database, and nginx reverse proxy, all containerized with Docker.

## Development Commands

### Frontend (React + TypeScript + Vite)
- `cd frontend && npm run dev` - Start development server with hot reload
- `cd frontend && npm run build` - Build for production (runs TypeScript check + Vite build)
- `cd frontend && npm run lint` - Run ESLint with TypeScript rules
- `cd frontend && npm run preview` - Preview production build

### Backend (Node.js + TypeScript + Express)
- `cd backend && npm start` - Start development server with nodemon and tsx (watches TypeScript files)
- No test command configured yet

### Docker Development
- `docker-compose up` - Build and start all services (nginx, backend, postgres)
- `docker-compose up --build` - Force rebuild containers before starting
- `docker-compose down` - Stop and remove containers

## Project Architecture

### Directory Structure
- `frontend/` - React + TypeScript Telegram Web App using TonConnect
- `backend/` - Node.js + Express + TypeScript REST API
- `nginx.conf` - Nginx configuration for serving frontend and proxying API calls
- `docker-compose.yml` - Orchestrates all services (nginx, backend, postgres)

### Backend Architecture
- `backend/src/app.ts` - Main Express server with REST API endpoints
- `backend/src/database.ts` - PostgreSQL connection pool and all database operations
- `backend/src/ton-service.ts` - TON blockchain transaction verification service

### Database Schema
The app uses PostgreSQL with these main tables:
- `users` - Telegram user data
- `gifts` - Available items in the shop
- `user_gifts` - User inventory (purchased items)
- `roulette_rounds` - Game rounds with status and winner tracking
- `roulette_bets` - Individual bets placed in rounds

### Frontend Architecture
- Single page application with three views: Shop, Inventory, Roulette
- Uses `@tonconnect/ui-react` for TON wallet integration
- Uses `@twa-dev/sdk` for Telegram Web App functionality
- API calls go through nginx proxy (empty API_BASE_URL in frontend)

## Key API Endpoints

- `GET /api/store/gifts` - Get all available gifts
- `POST /api/users/sync` - Create/sync Telegram user
- `POST /api/store/buy` - Purchase gift with TON transaction verification
- `GET /api/users/:userId/gifts` - Get user's available gifts (not yet bet)
- `POST /api/roulette/bet` - Place a bet with a user's gift
- `GET /api/roulette/state` - Get current round state and participants

## TON Integration

The app verifies TON cryptocurrency payments by:
1. User sends TON to hardcoded wallet address with memo
2. Backend checks recent transactions on TON testnet using `@orbs-network/ton-access`
3. If transaction matches amount and memo, gift is granted to user

Wallet address: `UQA6qcGAwqhOxgX81n-P_RVAIMOkeYoaoDWtAtyWAvOZtuuA` (configured in `ton-service.ts`)

## Environment Variables

Backend requires these environment variables (set in docker-compose.yml):
- `DB_USER` - PostgreSQL username
- `DB_HOST` - PostgreSQL host (docker service name)
- `DB_DATABASE` - PostgreSQL database name
- `DB_PASSWORD` - PostgreSQL password
- `DB_PORT` - PostgreSQL port
- `PORT` - Backend server port

## Docker Setup

The application runs three containers:
1. `nginx` - Serves frontend build and proxies API calls to backend
2. `backend` - Node.js API server
3. `db` - PostgreSQL 15 database

Nginx configuration (`nginx.conf`) handles:
- Serving React build files from `/usr/share/nginx/html`
- SPA routing (all routes serve `index.html`)
- CORS headers for `tonconnect-manifest.json`
- API proxy to backend container on `/api/*` routes

## Development Notes

- Backend uses ES modules (`"type": "module"` in package.json)
- Frontend uses Vite with React plugin and node polyfills for crypto libraries
- TypeScript configured for both frontend and backend
- The app includes an old frontend version in `frontend_old/` directory
- Database seeding happens automatically on backend startup

## Production Deployment

### Domain Configuration
- Production domain: `v416113.hosted-by-vdsina.com`
- SSL certificates should be mounted to `/etc/nginx/ssl/` in nginx container
- Environment variable `DOMAIN_NAME` is used in nginx configuration

### Deployment Commands
```bash
# Stop and remove external nginx (one-time setup)
sudo systemctl stop nginx && sudo systemctl disable nginx
sudo apt remove nginx nginx-common nginx-full -y

# Copy SSL certificates before removing nginx
sudo cp -r /etc/letsencrypt ./ssl-certs/
sudo chown -R $USER:$USER ./ssl-certs/

# Deploy application
docker-compose down
docker-compose up --build -d

# Check status
docker-compose ps
docker-compose logs -f
```

### SSL Configuration
- Nginx container handles SSL termination
- HTTP requests automatically redirect to HTTPS
- SSL certificates expected at `/etc/nginx/ssl/fullchain.pem` and `/etc/nginx/ssl/privkey.pem`