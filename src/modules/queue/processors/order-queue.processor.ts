import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import type { Job, Queue } from 'bullmq';

import { LogService } from '../../log/log.service.ts';
import { ExpireAssignmentCommand } from '../../order/commands/expire-assignment.command.ts';
import type { IExpireAssignmentResult } from '../../order/commands/expire-assignment.handler.ts';
import { ProcessAssignmentCommand } from '../../order/commands/process-assignment.command.ts';
import type { IProcessAssignmentResult } from '../../order/commands/process-assignment.handler.ts';
import { GetFailedDriverIdsQuery } from '../../order/queries/get-failed-driver-ids.query.ts';
import { ASSIGN_DRIVER_QUEUE } from '../queue.constants.ts';

export interface IAssignDriverJobData {
  orderId: Uuid;
  excludeDriverIds: Uuid[];
  attempt: number;
}

export interface ICheckExpiryJobData {
  orderId: Uuid;
  assignmentId: Uuid;
  driverId: Uuid;
  excludeDriverIds: Uuid[];
  attempt: number;
}

/*
 * Unified processor for the assign-driver queue.
 *
 * Routes jobs by name:
 *  - "assign"       → driver assignment logic
 *  - "check-expiry" → assignment expiry + re-assignment
 *
 * Having a SINGLE @Processor per queue is mandatory in BullMQ —
 * multiple @Processor decorators on the same queue name would
 * cause only the last-registered one to receive jobs.
 */
@Processor(ASSIGN_DRIVER_QUEUE, {
  concurrency: 5,
  limiter: {
    max: 10,
    duration: 1000,
  },
})
export class OrderQueueProcessor extends WorkerHost {
  private readonly logger = new Logger(OrderQueueProcessor.name);

  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
    private readonly logService: LogService,
    @InjectQueue(ASSIGN_DRIVER_QUEUE)
    private readonly assignQueue: Queue,
  ) {
    super();
  }

  /**
   * Main dispatch method — routes to handler based on job name.
   */
  async process(job: Job): Promise<void> {
    switch (job.name) {
      case 'assign': {
        await this.handleAssignment(job as Job<IAssignDriverJobData>);
        break;
      }

      case 'check-expiry': {
        await this.handleCheckExpiry(job as Job<ICheckExpiryJobData>);
        break;
      }

      default: {
        this.logger.warn(`Unknown job name: ${job.name}`);
      }
    }
  }

  /* Assign Driver */

  private async handleAssignment(
    job: Job<IAssignDriverJobData>,
  ): Promise<void> {
    const { orderId, excludeDriverIds, attempt } = job.data;

    this.logger.log(
      `Processing assignment for order ${orderId}, attempt ${attempt}`,
    );

    try {
      const result = await this.commandBus.execute<
        ProcessAssignmentCommand,
        IProcessAssignmentResult
      >(new ProcessAssignmentCommand(orderId, excludeDriverIds));

      if (result.assigned && result.assignmentId && result.driverId) {
        // Schedule an expiry check in 60 seconds
        await this.assignQueue.add(
          'check-expiry',
          {
            orderId,
            assignmentId: result.assignmentId,
            driverId: result.driverId,
            excludeDriverIds: [...excludeDriverIds, result.driverId],
            attempt: attempt + 1,
          } satisfies ICheckExpiryJobData,
          { delay: 60_000 },
        );

        this.logger.log(
          `Driver ${result.driverId} assigned to order ${orderId}, expiry check scheduled`,
        );
      } else if (result.shouldRetry) {
        const delay = Math.min(5000 * Math.pow(2, attempt - 1), 30_000);

        await this.assignQueue.add(
          'assign',
          {
            orderId,
            excludeDriverIds,
            attempt: attempt + 1,
          } satisfies IAssignDriverJobData,
          { delay },
        );

        await this.logService.warn(
          'OrderQueueProcessor',
          'RETRY_ASSIGNMENT',
          `No driver available for order ${orderId}, retrying in ${delay}ms`,
          { orderId },
        );
      } else {
        await this.logService.error(
          'OrderQueueProcessor',
          'ASSIGNMENT_FAILED',
          `Assignment failed for order ${orderId} after ${result.attempts} attempts`,
          { orderId },
        );
      }
    } catch (error: unknown) {
      await this.logService.error(
        'OrderQueueProcessor',
        'ASSIGNMENT_ERROR',
        `Error processing assignment for order ${orderId}: ${error instanceof Error ? error.message : String(error)}`,
        {
          orderId,
          metadata: {
            error: error instanceof Error ? error.stack : String(error),
          },
        },
      );

      throw error; // Let BullMQ retry
    }
  }

  /* Check Expiry */

  private async handleCheckExpiry(
    job: Job<ICheckExpiryJobData>,
  ): Promise<void> {
    const { assignmentId, orderId, excludeDriverIds, attempt } = job.data;

    this.logger.log(
      `Checking expiry for assignment ${assignmentId}, order ${orderId}`,
    );

    try {
      const result = await this.commandBus.execute<
        ExpireAssignmentCommand,
        IExpireAssignmentResult
      >(new ExpireAssignmentCommand(assignmentId));

      if (!result.shouldReassign) {
        this.logger.log(
          `Assignment ${assignmentId} already responded, no action needed`,
        );

        return;
      }

      // Get full exclusion list (previously failed + current driver)
      const failedDriverIds = await this.queryBus.execute<
        GetFailedDriverIdsQuery,
        Uuid[]
      >(new GetFailedDriverIdsQuery(orderId));
      const updatedExcludeIds = [
        ...new Set([...excludeDriverIds, ...failedDriverIds]),
      ];

      // Enqueue a new assignment attempt with updated exclusion list
      await this.assignQueue.add(
        'assign',
        {
          orderId,
          excludeDriverIds: updatedExcludeIds,
          attempt,
        } satisfies IAssignDriverJobData,
        { delay: 1000 },
      );

      await this.logService.info(
        'OrderQueueProcessor',
        'REASSIGN_AFTER_EXPIRY',
        `Assignment ${assignmentId} expired, re-assigning order ${orderId}`,
        { orderId, metadata: { assignmentId, attempt } },
      );
    } catch (error: unknown) {
      await this.logService.error(
        'OrderQueueProcessor',
        'EXPIRY_CHECK_ERROR',
        `Error checking expiry for assignment ${assignmentId}: ${error instanceof Error ? error.message : String(error)}`,
        {
          orderId,
          metadata: {
            assignmentId,
            error: error instanceof Error ? error.stack : String(error),
          },
        },
      );

      throw error;
    }
  }
}
