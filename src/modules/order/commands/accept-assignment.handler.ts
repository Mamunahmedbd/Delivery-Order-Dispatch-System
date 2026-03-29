import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import type { OrderDto } from '../dtos/order.dto.ts';
import { OrderService } from '../order.service.ts';
import { AcceptAssignmentCommand } from './accept-assignment.command.ts';

@CommandHandler(AcceptAssignmentCommand)
export class AcceptAssignmentHandler
  implements ICommandHandler<AcceptAssignmentCommand, OrderDto>
{
  constructor(private readonly orderService: OrderService) {}

  execute(command: AcceptAssignmentCommand): Promise<OrderDto> {
    return this.orderService.acceptAssignment(
      command.assignmentId,
      command.driverId,
    );
  }
}
