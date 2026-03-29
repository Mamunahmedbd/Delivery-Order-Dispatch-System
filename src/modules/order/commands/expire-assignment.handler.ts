import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { OrderService } from '../order.service.ts';
import { ExpireAssignmentCommand } from './expire-assignment.command.ts';

export interface IExpireAssignmentResult {
  orderId: Uuid;
  driverId: Uuid;
  shouldReassign: boolean;
}

@CommandHandler(ExpireAssignmentCommand)
export class ExpireAssignmentHandler
  implements ICommandHandler<ExpireAssignmentCommand, IExpireAssignmentResult>
{
  constructor(private readonly orderService: OrderService) {}

  execute(command: ExpireAssignmentCommand): Promise<IExpireAssignmentResult> {
    return this.orderService.expireAssignment(command.assignmentId);
  }
}
