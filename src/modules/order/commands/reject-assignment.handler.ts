import { InjectQueue } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandHandler, type ICommandHandler, QueryBus } from '@nestjs/cqrs';
import type { Queue } from 'bullmq';

import type { IAssignDriverJobData } from '../../queue/processors/order-queue.processor.ts';
import { ASSIGN_DRIVER_QUEUE } from '../../queue/queue.constants.ts';
import { OrderService } from '../order.service.ts';
import { GetFailedDriverIdsQuery } from '../queries/get-failed-driver-ids.query.ts';
import { RejectAssignmentCommand } from './reject-assignment.command.ts';

export interface IRejectAssignmentResult {
  orderId: Uuid;
  shouldReassign: boolean;
}

@CommandHandler(RejectAssignmentCommand)
export class RejectAssignmentHandler
  implements ICommandHandler<RejectAssignmentCommand, IRejectAssignmentResult>
{
  private readonly logger = new Logger(RejectAssignmentHandler.name);

  constructor(
    private readonly orderService: OrderService,
    private readonly queryBus: QueryBus,
    @InjectQueue(ASSIGN_DRIVER_QUEUE)
    private readonly assignQueue: Queue,
  ) {}

  async execute(
    command: RejectAssignmentCommand,
  ): Promise<IRejectAssignmentResult> {
    const { assignmentId, driverId } = command;

    const result = await this.orderService.rejectAssignment(
      assignmentId,
      driverId,
    );

    if (result.shouldReassign) {
      // Get all failed drivers for this order to build current exclusion list
      const failedDriverIds = await this.queryBus.execute<
        GetFailedDriverIdsQuery,
        Uuid[]
      >(new GetFailedDriverIdsQuery(result.orderId));

      // Trigger immediate re-assignment attempt
      const jobData: IAssignDriverJobData = {
        orderId: result.orderId,
        excludeDriverIds: failedDriverIds,
        attempt: 1, // Reset attempt or increment? Let's treat it as a fresh sequence but with exclusions
      };

      await this.assignQueue.add('assign', jobData, { delay: 1000 });

      this.logger.log(
        `Assignment ${assignmentId} rejected by driver ${driverId}, re-assignment queued for order ${result.orderId}`,
      );
    }

    return result;
  }
}
