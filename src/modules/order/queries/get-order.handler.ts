import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import type { OrderDto } from '../dtos/order.dto.ts';
import { OrderService } from '../order.service.ts';
import { GetOrderQuery } from './get-order.query.ts';

@QueryHandler(GetOrderQuery)
export class GetOrderHandler
  implements IQueryHandler<GetOrderQuery, OrderDto>
{
  constructor(private readonly orderService: OrderService) {}

  execute(query: GetOrderQuery): Promise<OrderDto> {
    return this.orderService.getOrder(query.orderId);
  }
}
