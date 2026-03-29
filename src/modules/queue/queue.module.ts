import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';

import { ApiConfigService } from '../../shared/services/api-config.service.ts';
import { SharedModule } from '../../shared/shared.module.ts';
import { DriverModule } from '../driver/driver.module.ts';
import { OrderModule } from '../order/order.module.ts';
import { WalletModule } from '../wallet/wallet.module.ts';
import { OrderQueueProcessor } from './processors/order-queue.processor.ts';
import { PaymentProcessor } from './processors/payment.processor.ts';
import { ASSIGN_DRIVER_QUEUE, PAYMENT_QUEUE } from './queue.constants.ts';

@Module({
  imports: [
    CqrsModule,
    BullModule.forRootAsync({
      imports: [SharedModule],
      useFactory: (configService: ApiConfigService) => ({
        connection: configService.redisConfig,
      }),
      inject: [ApiConfigService],
    }),
    BullModule.registerQueue(
      { name: ASSIGN_DRIVER_QUEUE },
      { name: PAYMENT_QUEUE },
    ),
    DriverModule,
    OrderModule,
    WalletModule,
  ],
  providers: [OrderQueueProcessor, PaymentProcessor],
  exports: [BullModule],
})
export class QueueModule {}
