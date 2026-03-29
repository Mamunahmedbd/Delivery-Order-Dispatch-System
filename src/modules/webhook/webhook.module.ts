import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';

import { OrderModule } from '../order/order.module.ts';
import { PAYMENT_QUEUE } from '../queue/queue.constants.ts';
import { WebhookController } from './webhook.controller.ts';
import { WebhookService } from './webhook.service.ts';

@Module({
  imports: [OrderModule, BullModule.registerQueue({ name: PAYMENT_QUEUE })],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
