import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDeliverySchema1711700000000 implements MigrationInterface {
  name = 'createDeliverySchema1711700000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // === ENUMS (idempotent — safe to re-run) ===
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "users_role_enum" AS ENUM('USER', 'DRIVER', 'ADMIN');
    EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "drivers_status_enum" AS ENUM('AVAILABLE', 'BUSY', 'OFFLINE');
    EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "orders_status_enum" AS ENUM('PENDING', 'ASSIGNING', 'ASSIGNED', 'PICKED_UP', 'DELIVERED', 'CANCELLED', 'FAILED');
    EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "order_assignments_status_enum" AS ENUM('PENDING', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED');
    EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "wallet_transactions_type_enum" AS ENUM('CREDIT', 'DEBIT');
    EXCEPTION WHEN duplicate_object THEN null; END $$`);
    await queryRunner.query(`DO $$ BEGIN
      CREATE TYPE "logs_level_enum" AS ENUM('INFO', 'WARN', 'ERROR');
    EXCEPTION WHEN duplicate_object THEN null; END $$`);

    // === USERS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"         uuid              NOT NULL DEFAULT uuid_generate_v4(),
        "created_at" TIMESTAMP         NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP         NOT NULL DEFAULT now(),
        "first_name" character varying,
        "last_name"  character varying,
        "role"       "users_role_enum" NOT NULL DEFAULT 'USER',
        "email"      character varying,
        "password"   character varying,
        "phone"      character varying,
        "avatar"     character varying,
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "PK_users" PRIMARY KEY ("id")
      )
    `);

    // === DRIVERS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "drivers" (
        "id"                    uuid                    NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"               uuid                    NOT NULL,
        "status"                "drivers_status_enum"   NOT NULL DEFAULT 'OFFLINE',
        "latitude"              decimal(10,7),
        "longitude"             decimal(10,7),
        "is_verified"           boolean                 NOT NULL DEFAULT false,
        "last_location_update"  TIMESTAMP,
        "created_at"            TIMESTAMP               NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP               NOT NULL DEFAULT now(),
        CONSTRAINT "PK_drivers" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_drivers_user_id" UNIQUE ("user_id"),
        CONSTRAINT "FK_drivers_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    // Index for nearest-driver queries
    await queryRunner.query(
      `CREATE INDEX "IDX_drivers_status" ON "drivers" ("status") WHERE "status" = 'AVAILABLE'`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_drivers_location" ON "drivers" ("latitude", "longitude") WHERE "status" = 'AVAILABLE'`,
    );

    // === ORDERS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "orders" (
        "id"                    uuid                    NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"               uuid                    NOT NULL,
        "assigned_driver_id"    uuid,
        "status"                "orders_status_enum"    NOT NULL DEFAULT 'PENDING',
        "pickup_address"        character varying       NOT NULL,
        "pickup_lat"            decimal(10,7)           NOT NULL,
        "pickup_lng"            decimal(10,7)           NOT NULL,
        "delivery_address"      character varying       NOT NULL,
        "delivery_lat"          decimal(10,7)           NOT NULL,
        "delivery_lng"          decimal(10,7)           NOT NULL,
        "delivery_fee"          decimal(12,2)           NOT NULL,
        "idempotency_key"       character varying,
        "assignment_attempts"   integer                 NOT NULL DEFAULT 0,
        "assigned_at"           TIMESTAMP,
        "delivered_at"          TIMESTAMP,
        "created_at"            TIMESTAMP               NOT NULL DEFAULT now(),
        "updated_at"            TIMESTAMP               NOT NULL DEFAULT now(),
        CONSTRAINT "PK_orders" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_orders_idempotency_key" UNIQUE ("idempotency_key"),
        CONSTRAINT "FK_orders_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_orders_driver" FOREIGN KEY ("assigned_driver_id")
          REFERENCES "drivers"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_status" ON "orders" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_orders_user_id" ON "orders" ("user_id")`,
    );

    // === ORDER ASSIGNMENTS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "order_assignments" (
        "id"           uuid                              NOT NULL DEFAULT uuid_generate_v4(),
        "order_id"     uuid                              NOT NULL,
        "driver_id"    uuid                              NOT NULL,
        "status"       "order_assignments_status_enum"   NOT NULL DEFAULT 'PENDING',
        "expires_at"   TIMESTAMP                         NOT NULL,
        "responded_at" TIMESTAMP,
        "created_at"   TIMESTAMP                         NOT NULL DEFAULT now(),
        CONSTRAINT "PK_order_assignments" PRIMARY KEY ("id"),
        CONSTRAINT "FK_order_assignments_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_order_assignments_driver" FOREIGN KEY ("driver_id")
          REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_order_assignments_order_id" ON "order_assignments" ("order_id")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_order_assignments_driver_pending" ON "order_assignments" ("driver_id", "status") WHERE "status" = 'PENDING'`,
    );

    // === WALLETS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "wallets" (
        "id"         uuid            NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"    uuid            NOT NULL,
        "balance"    decimal(14,2)   NOT NULL DEFAULT 0,
        "version"    integer         NOT NULL DEFAULT 1,
        "created_at" TIMESTAMP       NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP       NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallets" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_wallets_user_id" UNIQUE ("user_id"),
        CONSTRAINT "CHK_wallets_balance_non_negative" CHECK ("balance" >= 0),
        CONSTRAINT "FK_wallets_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    // === WALLET TRANSACTIONS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "wallet_transactions" (
        "id"              uuid                           NOT NULL DEFAULT uuid_generate_v4(),
        "wallet_id"       uuid                           NOT NULL,
        "order_id"        uuid,
        "type"            "wallet_transactions_type_enum" NOT NULL,
        "amount"          decimal(14,2)                  NOT NULL,
        "balance_before"  decimal(14,2)                  NOT NULL,
        "balance_after"   decimal(14,2)                  NOT NULL,
        "description"     character varying              NOT NULL,
        "idempotency_key" character varying,
        "created_at"      TIMESTAMP                      NOT NULL DEFAULT now(),
        CONSTRAINT "PK_wallet_transactions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_wallet_transactions_wallet" FOREIGN KEY ("wallet_id")
          REFERENCES "wallets"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_wallet_transactions_order" FOREIGN KEY ("order_id")
          REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE NO ACTION
      )
    `);
    // Unique partial indexes for idempotency
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_wallet_txn_order" ON "wallet_transactions" ("order_id") WHERE "order_id" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_wallet_txn_idempotency" ON "wallet_transactions" ("idempotency_key") WHERE "idempotency_key" IS NOT NULL`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_wallet_txn_wallet_id" ON "wallet_transactions" ("wallet_id")`,
    );

    // === LOGS TABLE ===
    await queryRunner.query(`
      CREATE TABLE "logs" (
        "id"         uuid                NOT NULL DEFAULT uuid_generate_v4(),
        "level"      "logs_level_enum"   NOT NULL,
        "context"    character varying    NOT NULL,
        "action"     character varying    NOT NULL,
        "message"    text                NOT NULL,
        "metadata"   jsonb,
        "order_id"   uuid,
        "driver_id"  uuid,
        "user_id"    uuid,
        "created_at" TIMESTAMP           NOT NULL DEFAULT now(),
        CONSTRAINT "PK_logs" PRIMARY KEY ("id")
      )
    `);
    await queryRunner.query(
      `CREATE INDEX "IDX_logs_context_action" ON "logs" ("context", "action")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_logs_created_at" ON "logs" ("created_at")`,
    );
    await queryRunner.query(
      `CREATE INDEX "IDX_logs_order_id" ON "logs" ("order_id") WHERE "order_id" IS NOT NULL`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE IF EXISTS "logs"');
    await queryRunner.query('DROP TABLE IF EXISTS "wallet_transactions"');
    await queryRunner.query('DROP TABLE IF EXISTS "wallets"');
    await queryRunner.query('DROP TABLE IF EXISTS "order_assignments"');
    await queryRunner.query('DROP TABLE IF EXISTS "orders"');
    await queryRunner.query('DROP TABLE IF EXISTS "drivers"');
    await queryRunner.query('DROP TABLE IF EXISTS "users"');

    await queryRunner.query('DROP TYPE IF EXISTS "logs_level_enum"');
    await queryRunner.query(
      'DROP TYPE IF EXISTS "wallet_transactions_type_enum"',
    );
    await queryRunner.query(
      'DROP TYPE IF EXISTS "order_assignments_status_enum"',
    );
    await queryRunner.query('DROP TYPE IF EXISTS "orders_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "drivers_status_enum"');
    await queryRunner.query('DROP TYPE IF EXISTS "users_role_enum"');
  }
}
