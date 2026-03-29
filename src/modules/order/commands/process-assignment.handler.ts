import { CommandHandler, type ICommandHandler } from '@nestjs/cqrs';

import { OrderService } from '../order.service.ts';
import { ProcessAssignmentCommand } from './process-assignment.command.ts';

export interface IProcessAssignmentResult {
  assigned: boolean;
  driverId?: Uuid;
  assignmentId?: Uuid;
  shouldRetry: boolean;
  attempts: number;
}

@CommandHandler(ProcessAssignmentCommand)
export class ProcessAssignmentHandler
  implements ICommandHandler<ProcessAssignmentCommand, IProcessAssignmentResult>
{
  constructor(private readonly orderService: OrderService) {}

  execute(
    command: ProcessAssignmentCommand,
  ): Promise<IProcessAssignmentResult> {
    return this.orderService.processAssignment(
      command.orderId,
      command.excludeDriverIds,
    );
  }
}
