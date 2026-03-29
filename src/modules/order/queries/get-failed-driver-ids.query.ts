import { IQuery } from '@nestjs/cqrs';

export class GetFailedDriverIdsQuery implements IQuery {
  constructor(public readonly orderId: Uuid) {}
}
