# LMS Backend

Backend API for Learning Management System built with Node.js, Express, TypeORM, and PostgreSQL.

## Tech Stack

- **Node.js** - Runtime environment
- **Express.js** - Web framework
- **TypeScript** - Type-safe JavaScript
- **TypeORM** - ORM for database operations
- **PostgreSQL** - Database
- **pnpm** - Package manager

## Prerequisites

- Node.js (v18+)
- PostgreSQL (v14+)
- pnpm

## Setup

1. **Install dependencies:**
   ```bash
   pnpm install
   ```

2. **Configure environment:**
   - Copy `.env.example` to `.env`
   - Update database credentials in `.env`

3. **Create database:**
   ```sql
   CREATE DATABASE lms_db;
   ```

4. **Run development server:**
   ```bash
   pnpm dev
   ```

## Scripts

- `pnpm dev` - Start development server with hot reload
- `pnpm build` - Build for production
- `pnpm start` - Start production server
- `pnpm typeorm` - Run TypeORM CLI commands

## API Endpoints

### Health Check
- `GET /` - API status
- `GET /health` - Health check

### Users
- `GET /api/users` - Get all users
- `GET /api/users/:id` - Get user by ID
- `POST /api/users` - Create new user
- `PUT /api/users/:id` - Update user
- `DELETE /api/users/:id` - Delete user

## Project Structure

```
src/
├── config/          # Configuration files
│   └── data-source.ts
├── controllers/     # Request handlers
│   └── UserController.ts
├── entities/        # TypeORM entities
│   └── User.ts
├── middleware/      # Custom middleware
├── routes/          # API routes
│   └── userRoutes.ts
├── services/        # Business logic
└── index.ts         # Application entry point
```

## Environment Variables

```env
PORT=5000
NODE_ENV=development
DB_HOST=localhost
DB_PORT=5432
DB_USERNAME=postgres
DB_PASSWORD=your_password
DB_DATABASE=lms_db
CORS_ORIGIN=http://localhost:3000
```
