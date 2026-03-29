import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';

import { DriverModule } from '../driver/driver.module.ts';
import { ASSIGN_DRIVER_QUEUE } from '../queue/queue.constants.ts';
import { WalletModule } from '../wallet/wallet.module.ts';
import { AcceptAssignmentHandler } from './commands/accept-assignment.handler.ts';
import { CompleteOrderHandler } from './commands/complete-order.handler.ts';
import { CreateOrderHandler } from './commands/create-order.handler.ts';
import { ExpireAssignmentHandler } from './commands/expire-assignment.handler.ts';
import { ProcessAssignmentHandler } from './commands/process-assignment.handler.ts';
import { RejectAssignmentHandler } from './commands/reject-assignment.handler.ts';
import { OrderController } from './order.controller.ts';
import { OrderEntity } from './order.entity.ts';
import { OrderService } from './order.service.ts';
import { OrderAssignmentController } from './order-assignment.controller.ts';
import { OrderAssignmentEntity } from './order-assignment.entity.ts';
import { GetFailedDriverIdsHandler } from './queries/get-failed-driver-ids.handler.ts';
import { GetOrderHandler } from './queries/get-order.handler.ts';
import { GetUserOrdersHandler } from './queries/get-user-orders.handler.ts';

@Module({
  imports: [
    TypeOrmModule.forFeature([OrderEntity, OrderAssignmentEntity]),
    BullModule.registerQueue({ name: ASSIGN_DRIVER_QUEUE }),
    CqrsModule,
    DriverModule,
    WalletModule,
  ],
  controllers: [OrderController, OrderAssignmentController],
  providers: [
    OrderService,
    // Command handlers
    CreateOrderHandler,
    AcceptAssignmentHandler,
    RejectAssignmentHandler,
    CompleteOrderHandler,
    ProcessAssignmentHandler,
    ExpireAssignmentHandler,
    // Query handlers
    GetOrderHandler,
    GetUserOrdersHandler,
    GetFailedDriverIdsHandler,
  ],
  exports: [OrderService],
})
export class OrderModule { }
