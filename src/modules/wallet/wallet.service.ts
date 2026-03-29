import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';

import { TransactionType } from '../../constants/transaction-type.ts';
import { LogService } from '../log/log.service.ts';
import type { WalletDto } from './dtos/wallet.dto.ts';
import type { WalletTransactionDto } from './dtos/wallet-transaction.dto.ts';
import { WalletEntity } from './wallet.entity.ts';
import { WalletTransactionEntity } from './wallet-transaction.entity.ts';

@Injectable()
export class WalletService {
  constructor(
    @InjectRepository(WalletEntity)
    private readonly walletRepository: Repository<WalletEntity>,
    private readonly dataSource: DataSource,
    private readonly logService: LogService,
  ) {}

  /**
   * Create a wallet for a user. Called during user registration.
   */
  async createWallet(userId: Uuid): Promise<WalletDto> {
    const existing = await this.walletRepository.findOneBy({ userId });

    if (existing) {
      return existing.toDto();
    }

    const wallet = this.walletRepository.create({ userId, balance: 0 });

    const saved = await this.walletRepository.save(wallet);

    return saved.toDto();
  }

  /**
   * Get the current balance for a user.
   */
  async getBalance(userId: Uuid): Promise<WalletDto> {
    const wallet = await this.walletRepository.findOneBy({ userId });

    if (!wallet) {
      throw new BadRequestException('Wallet not found for this user');
    }

    return wallet.toDto();
  }

  /**
   * Credit (add) funds to a user's wallet.
   */
  async credit(
    userId: Uuid,
    amount: number,
    description: string,
    idempotencyKey?: string,
  ): Promise<WalletTransactionDto> {
    if (amount <= 0) {
      throw new BadRequestException('Credit amount must be positive');
    }

    return this.dataSource.transaction(async (manager) => {
      // Check idempotency
      if (idempotencyKey) {
        const existing = await manager.findOne(WalletTransactionEntity, {
          where: { idempotencyKey },
        });

        if (existing) {
          return existing.toDto();
        }
      }

      // Lock the wallet row
      const wallet = await manager
        .createQueryBuilder(WalletEntity, 'w')
        .setLock('pessimistic_write')
        .where('w.userId = :userId', { userId })
        .getOne();

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      const balanceBefore = Number.parseFloat(
        wallet.balance as unknown as string,
      );
      const balanceAfter = balanceBefore + amount;

      // Update balance
      wallet.balance = balanceAfter;
      await manager.save(WalletEntity, wallet);

      // Record transaction
      const txn = manager.create(WalletTransactionEntity, {
        walletId: wallet.id,
        type: TransactionType.CREDIT,
        amount,
        balanceBefore,
        balanceAfter,
        description,
        idempotencyKey: idempotencyKey ?? null,
        orderId: null,
      });

      const savedTxn = await manager.save(WalletTransactionEntity, txn);

      await this.logService.info(
        'WalletService',
        'CREDIT',
        `Credited ${amount} to wallet`,
        {
          userId,
          metadata: {
            walletId: wallet.id,
            amount,
            balanceBefore,
            balanceAfter,
          },
        },
      );

      return savedTxn.toDto();
    });
  }

  /**
   * Idempotent debit (deduct) funds from a user's wallet.
   * Uses orderId as the dedup key — re-calling with same orderId returns the existing txn.
   * Uses optimistic lock version check + DB CHECK constraint as safety net.
   */
  async debit(
    userId: Uuid,
    orderId: Uuid,
    amount: number,
    description: string,
  ): Promise<WalletTransactionDto> {
    if (amount <= 0) {
      throw new BadRequestException('Debit amount must be positive');
    }

    return this.dataSource.transaction(async (manager) => {
      // Idempotency check: already debited for this order?
      const existingTxn = await manager.findOne(WalletTransactionEntity, {
        where: { orderId },
      });

      if (existingTxn) {
        return existingTxn.toDto();
      }

      // Lock wallet row for update
      const wallet = await manager
        .createQueryBuilder(WalletEntity, 'w')
        .setLock('pessimistic_write')
        .where('w.userId = :userId', { userId })
        .getOne();

      if (!wallet) {
        throw new BadRequestException('Wallet not found');
      }

      const balanceBefore = Number.parseFloat(
        wallet.balance as unknown as string,
      );

      if (balanceBefore < amount) {
        await this.logService.error(
          'WalletService',
          'DEBIT_INSUFFICIENT',
          `Insufficient balance: ${balanceBefore} < ${amount}`,
          {
            userId,
            orderId,
            metadata: {
              walletId: wallet.id,
              amount,
              balanceBefore,
            },
          },
        );

        throw new BadRequestException(
          `Insufficient balance: ${balanceBefore} < ${amount}`,
        );
      }

      const balanceAfter = balanceBefore - amount;

      // Update balance — the DB CHECK constraint is the final safety net
      wallet.balance = balanceAfter;
      await manager.save(WalletEntity, wallet);

      // Record the transaction with orderId as unique dedup key
      const txn = manager.create(WalletTransactionEntity, {
        walletId: wallet.id,
        orderId,
        type: TransactionType.DEBIT,
        amount,
        balanceBefore,
        balanceAfter,
        description,
        idempotencyKey: `debit-order-${orderId}`,
      });

      let savedTxn: WalletTransactionEntity;

      try {
        savedTxn = await manager.save(WalletTransactionEntity, txn);
      } catch (error: unknown) {
        // Unique constraint violation = duplicate debit (race condition)
        if (
          error instanceof Error &&
          'code' in error &&
          (error as { code: string }).code === '23505'
        ) {
          throw new ConflictException('Debit already processed for this order');
        }

        throw error;
      }

      await this.logService.info(
        'WalletService',
        'DEBIT',
        `Debited ${amount} from wallet for order`,
        {
          userId,
          orderId,
          metadata: {
            walletId: wallet.id,
            amount,
            balanceBefore,
            balanceAfter,
          },
        },
      );

      return savedTxn.toDto();
    });
  }

  /**
   * Check if user has sufficient balance for an order.
   * Returns false (instead of throwing) if the wallet doesn't exist yet.
   */
  async hasSufficientBalance(userId: Uuid, amount: number): Promise<boolean> {
    try {
      const { balance } = await this.getBalance(userId);

      return Number.parseFloat(balance as unknown as string) >= amount;
    } catch {
      // No wallet → insufficient balance
      return false;
    }
  }

  /**
   * Ensure a wallet exists for a user.
   * Idempotent — returns existing wallet if one exists.
   * Should be called during user registration.
   */
  async ensureWallet(userId: Uuid): Promise<WalletDto> {
    return this.createWallet(userId);
  }
}
