import { ICommand } from '@nestjs/cqrs';

export class CompleteOrderCommand implements ICommand {
  constructor(public readonly orderId: Uuid) {}
}
