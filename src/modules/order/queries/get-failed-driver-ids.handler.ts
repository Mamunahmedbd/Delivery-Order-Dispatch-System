import { IQueryHandler, QueryHandler } from '@nestjs/cqrs';

import { OrderService } from '../order.service.ts';
import { GetFailedDriverIdsQuery } from './get-failed-driver-ids.query.ts';

@QueryHandler(GetFailedDriverIdsQuery)
export class GetFailedDriverIdsHandler
  implements IQueryHandler<GetFailedDriverIdsQuery, Uuid[]>
{
  constructor(private readonly orderService: OrderService) {}

  execute(query: GetFailedDriverIdsQuery): Promise<Uuid[]> {
    return this.orderService.getFailedDriverIds(query.orderId);
  }
}
