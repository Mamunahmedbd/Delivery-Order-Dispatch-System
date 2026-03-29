import { IQuery } from '@nestjs/cqrs';

export class GetUserOrdersQuery implements IQuery {
  constructor(public readonly userId: Uuid) {}
}
