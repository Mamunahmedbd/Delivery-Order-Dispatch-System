import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import type { OrderDto } from '../dtos/order.dto.ts';
import { OrderService } from '../order.service.ts';
import { CompleteOrderCommand } from './complete-order.command.ts';

@CommandHandler(CompleteOrderCommand)
export class CompleteOrderHandler
  implements ICommandHandler<CompleteOrderCommand, OrderDto>
{
  constructor(private readonly orderService: OrderService) {}

  execute(command: CompleteOrderCommand): Promise<OrderDto> {
    return this.orderService.completeOrder(command.orderId);
  }
}
