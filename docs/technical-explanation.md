# Delivery Order Dispatch System — Technical Documentation

## Overview

This system is a production-grade delivery order dispatch backend built on NestJS + TypeORM + PostgreSQL + BullMQ (Redis). It handles concurrent driver assignment, wallet-protected payments, idempotent webhook processing, and comprehensive failure logging.

---

## 1. Concurrency Handling

### Order Assignment — Pessimistic Locking

The assign-driver processor uses `SELECT ... FOR UPDATE` with a "skip locked" pattern:

```sql
-- Step 1: Lock the order row (skip if already locked by another worker)
SELECT * FROM orders WHERE id = :orderId FOR UPDATE SKIP LOCKED;

-- Step 2: Lock the nearest available driver
SELECT * FROM drivers
WHERE status = 'AVAILABLE' AND is_verified = true
ORDER BY SQRT(POW(latitude - :lat, 2) + POW(longitude - :lng, 2))
LIMIT 1
FOR UPDATE;
```

**Why this works:**
- `FOR UPDATE SKIP LOCKED` on the order ensures only one worker processes an order at a time. Other workers skip and move to the next job.
- `FOR UPDATE` on the driver row prevents the same driver being assigned to two orders simultaneously.
- The entire operation runs inside a single PostgreSQL transaction — if anything fails, all changes roll back atomically.

### Wallet Operations — Optimistic Locking + Constraints

```sql
-- Wallet has a version column for optimistic locking
UPDATE wallets SET balance = :newBalance, version = version + 1
WHERE id = :walletId AND version = :expectedVersion;

-- DB constraint prevents negative balance
CONSTRAINT "CHK_wallets_balance_non_negative" CHECK ("balance" >= 0)
```

**Layered protection:**
1. **Application-level check:** `if (balance < amount) throw`
2. **ORM version column:** TypeORM's `@VersionColumn()` detects concurrent modifications
3. **Database constraint:** `CHECK (balance >= 0)` is the absolute safety net

---

## 2. Duplicate Assignment Prevention

The order follows a strict state machine:

```
PENDING → ASSIGNING → ASSIGNED → PICKED_UP → DELIVERED
                                                 ↗
PENDING → ASSIGNING → FAILED (after 3 attempts)
```

**Guards:**
- Workers **only process** orders in `PENDING` or `ASSIGNING` state
- `SKIP LOCKED` ensures competing workers don't block each other
- The `assignmentAttempts` counter limits retries to 3
- Each assignment has an `expiresAt` timestamp — unresponded assignments are auto-expired

---

## 3. Wallet Deduction Protection

The debit flow has **three layers** of idempotency:

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| 1. Pre-check | `SELECT * FROM wallet_transactions WHERE order_id = :orderId` | Early return if already debited |
| 2. Unique index | `UNIQUE INDEX ON wallet_transactions(order_id) WHERE order_id IS NOT NULL` | Prevents race condition duplicates |
| 3. DB constraint | `CHECK (balance >= 0)` | Prevents negative balance even if ORM checks are bypassed |

**Flow:**
```
1. Check if a wallet_transaction with this orderId already exists
   → If yes, return the existing transaction (idempotent)
2. Lock the wallet row (FOR UPDATE)
3. Verify balance ≥ amount
4. Deduct balance
5. Insert wallet_transaction with orderId as dedup key
   → If unique constraint violated (23505), throw ConflictException
6. Commit
```

---

## 4. Retry Mechanism

### Driver Assignment Retries
- **Max attempts:** 3 (configurable via `MAX_ASSIGNMENT_ATTEMPTS`)
- **Strategy:** Re-enqueue job with excluded driver IDs + exponential backoff
- **Backoff delays:** 5s → 10s → 20s (capped at 30s)
- **On final failure:** Order status → `FAILED`, logged to `logs` table

### Payment Retries (BullMQ built-in)
```typescript
await this.paymentQueue.add('debit', paymentData, {
  attempts: 3,
  backoff: {
    type: 'exponential',
    delay: 5000, // 5s → 10s → 20s
  },
});
```

### Assignment Expiry
- Each assignment has a 60-second TTL
- A delayed BullMQ job checks if the driver responded
- If `PENDING` after 60s → status → `EXPIRED`, driver freed, re-assignment enqueued

---

## 5. Webhook Idempotency

The delivery webhook (`POST /webhooks/delivery`) uses the **double-check locking pattern**:

```
1. Find order by ID (no lock)
2. If order.status === 'DELIVERED' → return 200 (already processed)
3. BEGIN TRANSACTION
4. SELECT * FROM orders WHERE id = :orderId FOR UPDATE
5. Double-check: if status === 'DELIVERED' → return (race condition guard)
6. Set status = 'DELIVERED', deliveredAt = now()
7. Enqueue payment job
8. COMMIT
9. Return 200
```

**Why double-check?**
Between step 2 and step 4, another request might have already completed the order. The row lock + second check prevents:
- Double status transitions
- Double payment job enqueueing
- Inconsistent webhook responses

---

## 6. Scaling Strategy

### Horizontal Scaling
- **API servers:** Stateless — multiple instances behind a load balancer
- **Queue workers:** Multiple BullMQ workers consuming from the same Redis-backed queues
- **`SKIP LOCKED`** ensures workers don't block or duplicate each other's work

### Database Scaling
- Read replicas for query endpoints (`GET /orders`, `GET /wallets/balance`)
- Write operations use the primary with row-level locks
- Partial unique indexes minimize index bloat

### Redis Scaling
- BullMQ supports Redis Cluster for queue scaling
- Rate limiting can use Redis-backed storage (`ThrottlerStorageRedisService`)

### Future Improvements
- **PostGIS:** Replace Euclidean distance with proper Haversine distance for global accuracy
- **Connection pooling:** pgBouncer for high-concurrency scenarios
- **Event sourcing:** Decouple order state changes from side effects via event bus

---

## 7. API Endpoints

| Method | Path | Auth | Description |
|--------|------|------|-------------|
| POST | `/auth/register` | Public | Register a new user |
| POST | `/auth/login` | Public | Login and get JWT |
| POST | `/drivers/register` | USER | Register as a driver |
| PATCH | `/drivers/location` | DRIVER | Update GPS coordinates |
| PATCH | `/drivers/status` | DRIVER | Toggle availability |
| POST | `/orders` | USER (5/min) | Create delivery order |
| GET | `/orders/:id` | Authenticated | Get order details |
| GET | `/orders` | USER | List user's orders |
| POST | `/assignments/:id/accept` | DRIVER | Accept an assignment |
| POST | `/assignments/:id/reject` | DRIVER | Reject an assignment |
| GET | `/wallets/balance` | Authenticated | Get wallet balance |
| POST | `/wallets/top-up` | Authenticated | Add funds to wallet |
| POST | `/webhooks/delivery` | Public (HMAC) | Delivery status callback |

---

## 8. Database Schema

7 tables with the following key constraints:

- `wallets.balance CHECK >= 0` — prevents negative balance
- `wallet_transactions.order_id` — partial unique index for debit deduplication
- `wallet_transactions.idempotency_key` — partial unique index for credit deduplication
- `orders.idempotency_key` — unique index for webhook deduplication
- `drivers (latitude, longitude)` — partial index where status = AVAILABLE
- `logs (context, action)` — composite index for efficient filtering
