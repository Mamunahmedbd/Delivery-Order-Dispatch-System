import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AlterWalletPrecision1711800000000 implements MigrationInterface {
  name = 'alterWalletPrecision1711800000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wallets" ALTER COLUMN "balance" TYPE decimal(16,4)
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" ALTER COLUMN "amount" TYPE decimal(16,4)
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" ALTER COLUMN "balance_before" TYPE decimal(16,4)
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" ALTER COLUMN "balance_after" TYPE decimal(16,4)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "wallets" ALTER COLUMN "balance" TYPE decimal(14,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" ALTER COLUMN "amount" TYPE decimal(14,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" ALTER COLUMN "balance_before" TYPE decimal(14,2)
    `);
    await queryRunner.query(`
      ALTER TABLE "wallet_transactions" ALTER COLUMN "balance_after" TYPE decimal(14,2)
    `);
  }
}
