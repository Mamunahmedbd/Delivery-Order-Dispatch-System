import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';
import type { Queue } from 'bullmq';

import type { AssignDriverJobData } from '../../queue/processors/order-queue.processor.ts';
import { ASSIGN_DRIVER_QUEUE } from '../../queue/queue.constants.ts';
import type { OrderDto } from '../dtos/order.dto.ts';
import { OrderService } from '../order.service.ts';
import { CreateOrderCommand } from './create-order.command.ts';

@CommandHandler(CreateOrderCommand)
export class CreateOrderHandler implements ICommandHandler<
  CreateOrderCommand,
  OrderDto
> {
  private readonly logger = new Logger(CreateOrderHandler.name);

  constructor(
    private readonly orderService: OrderService,
    @InjectQueue(ASSIGN_DRIVER_QUEUE)
    private readonly assignQueue: Queue,
  ) {}

  async execute(command: CreateOrderCommand): Promise<OrderDto> {
    // 1. Create the order
    const order = await this.orderService.createOrder(
      command.userId,
      command.dto,
    );

    // 2. Enqueue the driver assignment job
    const jobData: AssignDriverJobData = {
      orderId: order.id,
      excludeDriverIds: [],
      attempt: 1,
    };

    await this.assignQueue.add('assign', jobData, {
      attempts: 3,
      backoff: {
        type: 'exponential',
        delay: 5000,
      },
    });

    this.logger.log(`Order ${order.id} created, assignment job enqueued`);

    return order;
  }
}
