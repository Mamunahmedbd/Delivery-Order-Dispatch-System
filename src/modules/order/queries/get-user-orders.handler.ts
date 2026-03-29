import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import type { OrderDto } from '../dtos/order.dto.ts';
import { OrderService } from '../order.service.ts';
import { GetUserOrdersQuery } from './get-user-orders.query.ts';

@QueryHandler(GetUserOrdersQuery)
export class GetUserOrdersHandler
  implements IQueryHandler<GetUserOrdersQuery, OrderDto[]>
{
  constructor(private readonly orderService: OrderService) {}

  execute(query: GetUserOrdersQuery): Promise<OrderDto[]> {
    return this.orderService.getUserOrders(query.userId);
  }
}
