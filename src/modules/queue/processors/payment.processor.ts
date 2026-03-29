import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import type { Job } from 'bullmq';

import { LogService } from '../../log/log.service.ts';
import { WalletService } from '../../wallet/wallet.service.ts';
import { PAYMENT_QUEUE } from '../queue.constants.ts';

export interface IPaymentJobData {
  userId: Uuid;
  orderId: Uuid;
  amount: number;
  description: string;
}

@Processor(PAYMENT_QUEUE, {
  concurrency: 3,
})
export class PaymentProcessor extends WorkerHost {
  private readonly logger = new Logger(PaymentProcessor.name);

  constructor(
    private readonly walletService: WalletService,
    private readonly logService: LogService,
  ) {
    super();
  }

  /**
   * Main dispatch method.
   */
  async process(job: Job<IPaymentJobData>): Promise<void> {
    switch (job.name) {
      case 'debit': {
        await this.handleDebit(job);
        break;
      }

      default: {
        this.logger.warn(`Unknown job name: ${job.name}`);
      }
    }
  }

  /**
   * Handle wallet debit for order delivery fee.
   *
   * Flow:
   * 1. Attempt to debit wallet (idempotent at service/DB level)
   * 2. Log success/fail
   * 3. Throw on transient errors for BullMQ retry
   */
  private async handleDebit(job: Job<IPaymentJobData>): Promise<void> {
    const { userId, orderId, amount, description } = job.data;

    try {
      await this.walletService.debit(userId, amount, description, orderId);

      await this.logService.info(
        'PaymentProcessor',
        'WALLET_DEBIT_SUCCESS',
        `Payment processed for order ${orderId}`,
        { orderId, userId },
      );
    } catch (error: unknown) {
      this.logger.error(
        `Failed to process payment for order ${orderId}: ${error instanceof Error ? error.message : String(error)}`,
      );

      // We throw to let BullMQ handle the retry logic
      throw error;
    }
  }
}
