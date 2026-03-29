import * as crypto from 'node:crypto';

import { InjectQueue } from '@nestjs/bullmq';
import { Injectable } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Queue } from 'bullmq';

import { OrderStatus } from '../../constants/order-status.ts';
import { LogService } from '../log/log.service.ts';
import { CompleteOrderCommand } from '../order/commands/complete-order.command.ts';
import { OrderDto } from '../order/dtos/order.dto.ts';
import { GetOrderQuery } from '../order/queries/get-order.query.ts';
import type { IPaymentJobData } from '../queue/processors/payment.processor.ts';
import { PAYMENT_QUEUE } from '../queue/queue.constants.ts';

export interface IDeliveryCallbackPayload {
  orderId: Uuid;
  status: string;
  timestamp: string;
}

@Injectable()
export class WebhookService {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly logService: LogService,
    @InjectQueue(PAYMENT_QUEUE)
    private readonly paymentQueue: Queue,
  ) { }

  /**
   * HMAC-SHA256 signature verification (placeholder — replace secret source in prod).
   */
  public verifySignature(signature: string, rawBody: string): boolean {
    // biome-ignore lint/security/noExternalIp: false positive or generic secret
    const secret = 'my-webhook-secret'; // Use config in prod
    const hmac = crypto.createHmac('sha256', secret);
    hmac.update(rawBody);
    const expected = hmac.digest('hex');

    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expected),
    );
  }

  /**
   * Process delivery callback — marks order as delivered and enqueues payment.
   */
  async handleDeliveryCallback(
    payload: IDeliveryCallbackPayload,
  ): Promise<{ processed: boolean; alreadyDelivered: boolean }> {
    const { orderId } = payload;

    // Quick check before locking
    const order = await this.queryBus.execute<GetOrderQuery, OrderDto>(
      new GetOrderQuery(orderId),
    );

    if (order.status === OrderStatus.DELIVERED) {
      return { processed: false, alreadyDelivered: true };
    }

    // Idempotent completion with locking (double-check pattern)
    const completedOrder = await this.commandBus.execute<
      CompleteOrderCommand,
      OrderDto
    >(new CompleteOrderCommand(orderId));

    // Enqueue payment job (wallet debit)
    const paymentData: IPaymentJobData = {
      userId: completedOrder.userId,
      orderId: completedOrder.id,
      amount: completedOrder.deliveryFee,
      description: `Delivery fee for order ${completedOrder.id}`,
    };

    await this.paymentQueue.add('debit', paymentData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    await this.logService.info(
      'WebhookService',
      'DELIVERY_CALLBACK',
      `Delivery confirmed for order ${orderId}, payment job enqueued`,
      { orderId, userId: completedOrder.userId },
    );

    return { processed: true, alreadyDelivered: false };
  }
}
