# Delivery Order Dispatch System

A production-grade delivery order dispatch backend built with **NestJS**, **PostgreSQL**, **BullMQ (Redis)**, and **CQRS**. Handles concurrent driver assignment, atomic wallet transactions, background queue processing with retries, and idempotent webhook callbacks.

---

## Table of Contents

- [Getting Started](#getting-started)
- [Environment Variables](#environment-variables)
- [Database Schema](#database-schema)
- [API Endpoints](#api-endpoints)
- [System Architecture](#system-architecture)
  - [How Concurrency is Handled](#1-how-concurrency-is-handled)
  - [How Duplicate Assignments are Prevented](#2-how-duplicate-assignments-are-prevented)
  - [How Wallet Deduction is Protected](#3-how-wallet-deduction-is-protected)
  - [How Retries Work](#4-how-retries-work)
  - [How Webhook Idempotency Works](#5-how-webhook-idempotency-works)
  - [How the System Could Scale](#6-how-the-system-could-scale)
- [Order Flow](#order-flow)

---

## Getting Started

```bash
# 1. Clone the repository
npx degit NarHakobyan/awesome-nest-boilerplate my-nest-app
cd my-nest-app

# 2. Create environment file
cp .env.example .env

# 3. Install dependencies (requires pnpm: https://pnpm.io/installation)
pnpm install

# 4. Start PostgreSQL and Redis (via Docker or local install)
# Ensure DB and Redis are running and .env is configured

# 5. Run development server (migrations run automatically)
pnpm start:dev

# 6. Open API documentation
# http://localhost:3000/documentation
```

---

## Environment Variables

| Variable | Description | Example |
|---|---|---|
| `DB_HOST` | PostgreSQL host | `localhost` |
| `DB_PORT` | PostgreSQL port | `5432` |
| `DB_USERNAME` | Database user | `postgres` |
| `DB_PASSWORD` | Database password | `postgres` |
| `DB_DATABASE` | Database name | `nest_boilerplate` |
| `REDIS_URL` | Redis connection URL | `redis://localhost:6379` |
| `WEBHOOK_SECRET` | HMAC secret for webhook signature verification | `my-webhook-secret` |
| `DRIVER_ASSIGNMENT_TIMEOUT_MS` | Assignment expiry timeout (ms) | `60000` |
| `MAX_ASSIGNMENT_ATTEMPTS` | Max driver assignment attempts before order fails | `3` |
| `JWT_PRIVATE_KEY` | RS256 private key for JWT signing | — |
| `JWT_PUBLIC_KEY` | RS256 public key for JWT verification | — |
| `JWT_EXPIRATION_TIME` | Token expiry in seconds | `3600` |

---

## Database Schema

The system uses **7 tables** with proper foreign keys, indexes, and constraints. Migrations run automatically on startup.

### Entity Relationship Diagram

```
┌──────────┐      ┌───────────┐      ┌──────────────────┐
│  users   │──1:1─│  drivers  │──1:N─│ order_assignments │
│          │      │           │      │                  │
│ id (PK)  │      │ id (PK)   │      │ id (PK)          │
│ email    │      │ user_id   │      │ order_id (FK)     │
│ password │      │ status    │      │ driver_id (FK)    │
│ role     │      │ latitude  │      │ status            │
│ ...      │      │ longitude │      │ expires_at        │
└──┬───────┘      └───────────┘      └──────────────────┘
   │                                          │
   │ 1:N                                      │ N:1
   ▼                                          ▼
┌──────────┐                          ┌──────────────┐
│  orders  │──────────────────────────│              │
│          │                          │              │
│ id (PK)  │                          │              │
│ user_id  │                          │              │
│ driver_id│                          │              │
│ status   │                          │              │
│ fee      │                          │              │
└──┬───────┘                          └──────────────┘
   │
   │ 1:1 (via wallet.user_id)
   ▼
┌──────────┐      ┌───────────────────────┐
│ wallets  │──1:N─│ wallet_transactions   │
│          │      │                       │
│ id (PK)  │      │ id (PK)               │
│ user_id  │      │ wallet_id (FK)        │
│ balance  │      │ order_id (FK, unique) │
│ version  │      │ type (CREDIT/DEBIT)   │
└──────────┘      │ amount                │
                  │ balance_before        │
┌──────────┐      │ balance_after         │
│   logs   │      └───────────────────────┘
│          │
│ id (PK)  │
│ level    │
│ context  │
│ action   │
│ message  │
│ metadata │
└──────────┘
```

### Tables Detail

#### `users`

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` | PK, auto-generated |
| `first_name` | `VARCHAR` | nullable |
| `last_name` | `VARCHAR` | nullable |
| `email` | `VARCHAR` | UNIQUE |
| `password` | `VARCHAR` | hashed |
| `role` | `ENUM('USER','DRIVER','ADMIN')` | default `USER` |
| `phone` | `VARCHAR` | nullable |
| `avatar` | `VARCHAR` | nullable |
| `created_at` | `TIMESTAMP` | default `now()` |
| `updated_at` | `TIMESTAMP` | default `now()` |

#### `drivers`

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` | PK |
| `user_id` | `UUID` | FK → users, UNIQUE |
| `status` | `ENUM('AVAILABLE','BUSY','OFFLINE')` | default `OFFLINE` |
| `latitude` | `DECIMAL(10,7)` | nullable |
| `longitude` | `DECIMAL(10,7)` | nullable |
| `is_verified` | `BOOLEAN` | default `false` |
| `last_location_update` | `TIMESTAMP` | nullable |
| `created_at` | `TIMESTAMP` | default `now()` |
| `updated_at` | `TIMESTAMP` | default `now()` |

**Indexes:**
- `IDX_drivers_status` — partial index on `status` WHERE `AVAILABLE`
- `IDX_drivers_location` — partial index on `(latitude, longitude)` WHERE `AVAILABLE`

#### `orders`

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` | PK |
| `user_id` | `UUID` | FK → users |
| `assigned_driver_id` | `UUID` | FK → drivers, nullable |
| `status` | `ENUM('PENDING','ASSIGNING','ASSIGNED','PICKED_UP','DELIVERED','CANCELLED','FAILED')` | default `PENDING` |
| `pickup_address` | `VARCHAR` | NOT NULL |
| `pickup_lat` | `DECIMAL(10,7)` | NOT NULL |
| `pickup_lng` | `DECIMAL(10,7)` | NOT NULL |
| `delivery_address` | `VARCHAR` | NOT NULL |
| `delivery_lat` | `DECIMAL(10,7)` | NOT NULL |
| `delivery_lng` | `DECIMAL(10,7)` | NOT NULL |
| `delivery_fee` | `DECIMAL(12,2)` | NOT NULL |
| `idempotency_key` | `VARCHAR` | UNIQUE, nullable |
| `assignment_attempts` | `INTEGER` | default `0` |
| `assigned_at` | `TIMESTAMP` | nullable |
| `delivered_at` | `TIMESTAMP` | nullable |
| `created_at` | `TIMESTAMP` | default `now()` |
| `updated_at` | `TIMESTAMP` | default `now()` |

**Indexes:**
- `IDX_orders_status` — on `status`
- `IDX_orders_user_id` — on `user_id`
- `UQ_orders_idempotency_key` — unique on `idempotency_key`

#### `order_assignments`

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` | PK |
| `order_id` | `UUID` | FK → orders |
| `driver_id` | `UUID` | FK → drivers |
| `status` | `ENUM('PENDING','ACCEPTED','REJECTED','EXPIRED','CANCELLED')` | default `PENDING` |
| `expires_at` | `TIMESTAMP` | NOT NULL |
| `responded_at` | `TIMESTAMP` | nullable |
| `created_at` | `TIMESTAMP` | default `now()` |

**Indexes:**
- `IDX_order_assignments_order_id` — on `order_id`
- `IDX_order_assignments_driver_pending` — partial on `(driver_id, status)` WHERE `PENDING`

#### `wallets`

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` | PK |
| `user_id` | `UUID` | FK → users, UNIQUE |
| `balance` | `DECIMAL(16,4)` | default `0`, **CHECK ≥ 0** |
| `version` | `INTEGER` | default `1` (optimistic lock) |
| `created_at` | `TIMESTAMP` | default `now()` |
| `updated_at` | `TIMESTAMP` | default `now()` |

**Constraints:**
- `CHK_wallets_balance_non_negative` — `CHECK (balance >= 0)` prevents overdraft at DB level

#### `wallet_transactions`

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` | PK |
| `wallet_id` | `UUID` | FK → wallets |
| `order_id` | `UUID` | FK → orders, nullable |
| `type` | `ENUM('CREDIT','DEBIT')` | NOT NULL |
| `amount` | `DECIMAL(16,4)` | NOT NULL |
| `balance_before` | `DECIMAL(16,4)` | NOT NULL |
| `balance_after` | `DECIMAL(16,4)` | NOT NULL |
| `description` | `VARCHAR` | NOT NULL |
| `idempotency_key` | `VARCHAR` | nullable |
| `created_at` | `TIMESTAMP` | default `now()` |

**Indexes (idempotency):**
- `IDX_wallet_txn_order` — **UNIQUE** partial on `order_id` WHERE NOT NULL (prevents duplicate debits per order)
- `IDX_wallet_txn_idempotency` — **UNIQUE** partial on `idempotency_key` WHERE NOT NULL
- `IDX_wallet_txn_wallet_id` — on `wallet_id`

#### `logs`

| Column | Type | Constraints |
|---|---|---|
| `id` | `UUID` | PK |
| `level` | `ENUM('INFO','WARN','ERROR')` | NOT NULL |
| `context` | `VARCHAR` | NOT NULL |
| `action` | `VARCHAR` | NOT NULL |
| `message` | `TEXT` | NOT NULL |
| `metadata` | `JSONB` | nullable |
| `order_id` | `UUID` | nullable |
| `driver_id` | `UUID` | nullable |
| `user_id` | `UUID` | nullable |
| `created_at` | `TIMESTAMP` | default `now()` |

**Indexes:**
- `IDX_logs_context_action` — on `(context, action)`
- `IDX_logs_created_at` — on `created_at`
- `IDX_logs_order_id` — partial on `order_id` WHERE NOT NULL

---

## API Endpoints

All endpoints are available at `http://localhost:3000`. Swagger documentation at `/documentation`.

### Authentication

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/auth/register` | Public | — | Register a new user (wallet auto-created) |
| `POST` | `/auth/login` | Public | — | Login, returns JWT token |
| `GET` | `/auth/me` | JWT (USER, ADMIN) | — | Get current user profile |

### Orders

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/orders` | JWT (USER, ADMIN) | **5 req/min** | Create a delivery order → enqueues driver assignment job |
| `GET` | `/orders` | JWT (USER, ADMIN) | — | List authenticated user's orders |
| `GET` | `/orders/:id` | JWT (USER, DRIVER, ADMIN) | — | Get order details by ID |

### Assignments (Driver Actions)

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/assignments/:id/accept` | JWT (DRIVER) | — | Accept an assignment → order status becomes `ASSIGNED` |
| `POST` | `/assignments/:id/reject` | JWT (DRIVER) | — | Reject → triggers automatic re-assignment via queue |

### Drivers

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/drivers/register` | JWT (USER) | — | Register current user as a driver |
| `PATCH` | `/drivers/location` | JWT (DRIVER) | — | Update GPS coordinates |
| `PATCH` | `/drivers/status` | JWT (DRIVER) | — | Toggle availability (AVAILABLE/OFFLINE) |

### Wallet

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `GET` | `/wallets/balance` | JWT (USER, DRIVER, ADMIN) | — | Get wallet balance |
| `POST` | `/wallets/top-up` | JWT (USER, DRIVER, ADMIN) | **3 req/min** | Add funds (supports idempotency key) |

### Webhooks

| Method | Endpoint | Auth | Rate Limit | Description |
|---|---|---|---|---|
| `POST` | `/webhooks/delivery` | HMAC Signature | **10 req/min** | Delivery confirmation callback (idempotent) |

---

## System Architecture

### Technology Stack

| Layer | Technology |
|---|---|
| Framework | NestJS v11 |
| Database | PostgreSQL (with `pessimistic_write` row locking) |
| Queue | BullMQ (backed by Redis) |
| Pattern | CQRS (Command Query Responsibility Segregation) |
| Auth | JWT RS256 (via Passport) |
| Docs | Swagger / OpenAPI |

### Module Structure

```
src/
├── modules/
│   ├── auth/           # JWT authentication (register, login, me)
│   ├── user/           # User CRUD and management
│   ├── driver/         # Driver registration, location, status
│   ├── order/          # Order creation, assignment, completion (CQRS)
│   │   ├── commands/   # CreateOrder, AcceptAssignment, RejectAssignment, etc.
│   │   └── queries/    # GetOrder, GetUserOrders, GetFailedDriverIds
│   ├── wallet/         # Wallet balance, credit, debit
│   ├── queue/          # BullMQ processors (assignment + payment)
│   ├── webhook/        # Delivery callback handler
│   └── log/            # Centralized audit logging (global module)
├── database/
│   └── migrations/     # TypeORM migrations (auto-run on startup)
└── shared/             # Config, interceptors, filters
```

---

### 1. How Concurrency is Handled

The system uses **PostgreSQL row-level locking** to handle concurrent access:

#### Order Locking — `pessimistic_write_or_fail`

When a BullMQ worker picks up an assignment job, it locks the order row using `SELECT FOR UPDATE SKIP LOCKED`:

```typescript
// order.service.ts — processAssignment()
const order = await manager
  .createQueryBuilder(OrderEntity, 'order')
  .setLock('pessimistic_write_or_fail') // SKIP LOCKED
  .where('order.id = :id', { id: orderId })
  .getOne();
```

- If **another worker already holds the lock**, the current worker receives `null` and skips the job — no blocking, no waiting.
- If the lock is acquired, the order status is atomically updated from `PENDING` → `ASSIGNING`.
- This guarantees that **only one worker processes a given order at any time**.

#### Driver Locking — `pessimistic_write`

When assigning a driver, the driver row is locked with `SELECT FOR UPDATE`:

```typescript
// driver.service.ts — findNearestAvailable()
const driver = await manager
  .createQueryBuilder(DriverEntity, 'driver')
  .setLock('pessimistic_write')
  .where('driver.status = :status', { status: DriverStatus.AVAILABLE })
  .andWhere('driver.id NOT IN (:...excludeIds)', { excludeIds })
  .orderBy(/* distance calculation */)
  .getOne();
```

- The driver's status is changed from `AVAILABLE` → `BUSY` **within the same transaction**.
- No two orders can lock the same driver simultaneously.

---

### 2. How Duplicate Assignments are Prevented

Multiple layers prevent the same order from being assigned to multiple drivers:

| Layer | Mechanism | What It Prevents |
|---|---|---|
| **Row lock** | `pessimistic_write_or_fail` on order | Two workers processing the same order simultaneously |
| **Status check** | Only orders in `PENDING`/`ASSIGNING` state are processed | Re-processing already assigned orders |
| **Driver lock** | `pessimistic_write` on driver row | Same driver assigned to two orders at once |
| **Assignment records** | `order_assignments` table tracks all attempts | Full audit trail of who was offered what |
| **Exclusion list** | Failed/expired driver IDs are accumulated and excluded | Same driver being offered the same order twice |
| **Atomic transaction** | Order update + driver status change + assignment record created in one transaction | Partial state (order assigned but driver still "available") |

---

### 3. How Wallet Deduction is Protected

The wallet debit flow uses **4 layers of protection**:

```
Application Idempotency Check
         │
         ▼
   Pessimistic Row Lock (wallet row)
         │
         ▼
   Balance Validation (application)
         │
         ▼
   DB CHECK Constraint (balance >= 0)
```

1. **Idempotency check** — Before debiting, the service checks if a `wallet_transaction` with the same `order_id` already exists. If yes, it returns the existing transaction (no duplicate debit).

2. **Unique partial index** — `CREATE UNIQUE INDEX ON wallet_transactions (order_id) WHERE order_id IS NOT NULL` — even if two concurrent requests bypass the application check, the database rejects the duplicate insert.

3. **Pessimistic row lock** — The wallet row is locked with `SELECT FOR UPDATE` for the duration of the debit transaction:
   ```typescript
   const wallet = await manager
     .createQueryBuilder(WalletEntity, 'wallet')
     .setLock('pessimistic_write')
     .where('wallet.userId = :userId', { userId })
     .getOne();
   ```

4. **CHECK constraint** — `CHECK (balance >= 0)` at the database level is the last safety net. Even if application logic has a bug, the database will reject any transaction that would result in a negative balance.

5. **Optimistic locking** — `@VersionColumn()` on the wallet entity catches any concurrent modifications that bypass the pessimistic lock path.

---

### 4. How Retries Work

The system uses **BullMQ** for reliable background job processing with built-in retry capabilities.

#### Driver Assignment Retries

```
Order Created
     │
     ▼
  ┌─────────────────┐
  │ assign job (#1)  │
  └────────┬────────┘
           │
     ┌─────┴──────┐
     │ Driver     │ YES → Schedule expiry check (60s delay)
     │ found?     │              │
     └─────┬──────┘              ▼
           │ NO           ┌──────────────────┐
           │              │ check-expiry job  │
           ▼              └────────┬─────────┘
  Retry with exponential          │
  backoff (5s, 10s, 20s)   ┌─────┴──────┐
           │                │ Driver     │ YES → Done ✅
           ▼                │ accepted?  │
  Max 3 attempts reached    └─────┬──────┘
  → Order status = FAILED         │ NO (expired/rejected)
                                  ▼
                            ┌─────────────────┐
                            │ assign job (#2)  │ (excludes failed drivers)
                            └─────────────────┘
```

- **No driver available:** Job retries with exponential backoff: `min(5000 × 2^(attempt-1), 30000)` ms
- **Driver doesn't respond in 60s:** `check-expiry` job fires, expires the assignment, enqueues a new `assign` job with updated exclusion list
- **Driver explicitly rejects:** New `assign` job enqueued immediately (1s delay) with the rejecting driver excluded
- **Max attempts exceeded:** Order status set to `FAILED`, logged for investigation

#### Payment Retries

```typescript
// payment.processor.ts
await this.paymentQueue.add('process-payment', { orderId, userId }, {
  attempts: 3,
  backoff: { type: 'exponential', delay: 5000 },
});
```

If the wallet debit fails (e.g., database timeout), BullMQ retries up to 3 times with exponential backoff (5s → 10s → 20s).

---

### 5. How Webhook Idempotency Works

The delivery webhook uses a **double-check pattern** to ensure each delivery is processed exactly once:

```
POST /webhooks/delivery
          │
          ▼
   Verify HMAC-SHA256 signature
          │
          ▼
   ┌──────────────────────┐
   │ Fast path (no lock): │
   │ Read order status    │
   │ Already DELIVERED?   │──── YES → Return 200 OK (no-op)
   └────────┬─────────────┘
            │ NO
            ▼
   ┌──────────────────────┐
   │ Lock path:           │
   │ SELECT FOR UPDATE    │
   │ Re-check status      │
   │ Still not DELIVERED? │──── NO → Return 200 OK (no-op)
   └────────┬─────────────┘
            │ YES
            ▼
   Set status = DELIVERED
   Enqueue payment job
   Return 200 OK
```

**Step 1 — Signature verification:**
```typescript
const hmac = crypto.createHmac('sha256', this.webhookSecret);
hmac.update(rawBody);
const expected = hmac.digest('hex');
return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
```

**Step 2 — Fast path (no lock):** Read the order status. If already `DELIVERED`, return `200 OK` immediately without acquiring any locks. This handles the majority of duplicate webhook calls efficiently.

**Step 3 — Lock path:** If the order isn't delivered yet, acquire a `pessimistic_write` lock on the order row, re-check the status (double-check pattern), and only then transition to `DELIVERED` and enqueue the payment job.

**Step 4 — Payment dedup:** Even if two webhook calls both reach the payment queue, the wallet debit's unique index on `order_id` prevents double-charging.

---

### 6. How the System Could Scale

| Strategy | Description |
|---|---|
| **Horizontal queue workers** | BullMQ workers are stateless — deploy multiple Node.js processes/pods to process jobs in parallel. The `concurrency: 5` setting controls per-worker parallelism. |
| **Database read replicas** | Route read queries (order listing, balance checks) to PostgreSQL read replicas. Write operations stay on the primary. |
| **Queue partitioning** | Split into region-specific queues (e.g., `assign-driver:us-east`, `assign-driver:eu-west`) for geographic isolation and reduced contention. |
| **Redis Cluster** | BullMQ supports Redis Cluster mode for queue backend scaling beyond single-node Redis limits. |
| **Connection pooling** | Use PgBouncer or similar connection pooler in front of PostgreSQL to handle thousands of concurrent connections. |
| **Caching** | Add Redis caching for driver locations (high-frequency writes during GPS updates) to reduce database load. |
| **Rate limiting** | Already implemented with `@Throttle` decorators — prevents abuse and protects backend resources. |
| **Monitoring** | Integrate BullMQ Board or Bull Dashboard for real-time queue health monitoring. Add Prometheus metrics for order processing latency and failure rates. |

---

## Order Flow

Complete lifecycle of a delivery order:

```
1. User creates order         POST /orders
   │                            └─ Validates balance, saves order, enqueues assign job
   ▼
2. Queue picks up job         BullMQ: assign-driver queue
   │                            └─ Locks order row, finds nearest available driver
   ▼
3. Driver is assigned          order_assignments record created
   │                            └─ Driver status: AVAILABLE → BUSY
   │                            └─ Expiry check scheduled (60s)
   ▼
4a. Driver accepts            POST /assignments/:id/accept
    │                            └─ Order: ASSIGNING → ASSIGNED
    ▼
5. Delivery happens            (external system)
    │
    ▼
6. Webhook callback            POST /webhooks/delivery
   │                            └─ Verifies signature, marks DELIVERED
   │                            └─ Enqueues payment job
   ▼
7. Payment processed           BullMQ: payment queue
                                └─ Debits user wallet (idempotent)

4b. Driver rejects            POST /assignments/:id/reject
    │                            └─ Enqueues new assign job (excludes this driver)
    └─ Go to step 2

4c. Driver doesn't respond     check-expiry job fires after 60s
    │                            └─ Expires assignment, enqueues new assign job
    └─ Go to step 2

4d. Max attempts exceeded      Order status → FAILED
                                └─ Logged for manual investigation
```

---

## Running Tests

```bash
# Unit tests
pnpm test

# Watch mode
pnpm test:watch

# Coverage
pnpm test:cov
```

---

## License

[MIT licensed](LICENSE).
