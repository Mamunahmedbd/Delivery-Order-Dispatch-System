import { ICommand } from '@nestjs/cqrs';

import type { CreateOrderDto } from '../dtos/create-order.dto.ts';

export class CreateOrderCommand implements ICommand {
  constructor(
    public readonly userId: Uuid,
    public readonly dto: CreateOrderDto,
  ) {}
}
