import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, EntityManager, Repository } from 'typeorm';

import { AssignmentStatus } from '../../constants/assignment-status.ts';
import { DriverStatus } from '../../constants/driver-status.ts';
import { OrderStatus } from '../../constants/order-status.ts';
import { AssignmentNotFoundException } from '../../exceptions/assignment-not-found.exception.ts';
import { OrderNotFoundException } from '../../exceptions/order-not-found.exception.ts';
import { DriverEntity } from '../driver/driver.entity.ts';
import { LogService } from '../log/log.service.ts';
import { WalletService } from '../wallet/wallet.service.ts';
import type { CreateOrderDto } from './dtos/create-order.dto.ts';
import type { OrderDto } from './dtos/order.dto.ts';
import { OrderEntity } from './order.entity.ts';
import { OrderAssignmentEntity } from './order-assignment.entity.ts';

@Injectable()
export class OrderService {
  private readonly logger = new Logger(OrderService.name);

  constructor(
    @InjectRepository(OrderEntity)
    private readonly orderRepository: Repository<OrderEntity>,
    @InjectRepository(OrderAssignmentEntity)
    private readonly assignmentRepository: Repository<OrderAssignmentEntity>,
    private readonly dataSource: DataSource,
    private readonly walletService: WalletService,
    private readonly logService: LogService,
  ) {}

  /**
   * Create a new delivery order.
   * Validates wallet balance ≥ delivery fee before accepting.
   */
  async createOrder(userId: Uuid, dto: CreateOrderDto): Promise<OrderDto> {
    // Validate wallet balance
    const hasFunds = await this.walletService.hasSufficientBalance(
      userId,
      dto.deliveryFee,
    );

    if (!hasFunds) {
      throw new BadRequestException(
        'Insufficient wallet balance to cover delivery fee',
      );
    }

    const order = this.orderRepository.create({
      userId,
      status: OrderStatus.PENDING,
      pickupAddress: dto.pickupAddress,
      pickupLat: dto.pickupLat,
      pickupLng: dto.pickupLng,
      deliveryAddress: dto.deliveryAddress,
      deliveryLat: dto.deliveryLat,
      deliveryLng: dto.deliveryLng,
      deliveryFee: dto.deliveryFee,
      assignmentAttempts: 0,
    });

    const savedOrder = await this.orderRepository.save(order);

    await this.logService.info(
      'OrderService',
      'CREATE_ORDER',
      `Order created: ${savedOrder.id}`,
      { orderId: savedOrder.id, userId },
    );

    return savedOrder.toDto();
  }

  /**
   * Get a single order by ID.
   */
  async getOrder(orderId: Uuid): Promise<OrderDto> {
    const order = await this.orderRepository.findOne({
      where: { id: orderId },
      relations: ['assignments'],
    });

    if (!order) {
      throw new OrderNotFoundException();
    }

    return order.toDto();
  }

  /**
   * Get all orders for a user.
   */
  async getUserOrders(userId: Uuid): Promise<OrderDto[]> {
    const orders = await this.orderRepository.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });

    return orders.toDtos();
  }

  /**
   * Process driver assignment for an order.
   * Called by the BullMQ assign-driver processor.
   *
   * Critical concurrency flow:
   * 1. SELECT FOR UPDATE SKIP LOCKED on the order row
   * 2. Find nearest available driver (excluding previously failed)
   * 3. Lock the driver row + set status=BUSY
   * 4. Create assignment record
   */
  async processAssignment(
    orderId: Uuid,
    excludeDriverIds: Uuid[] = [],
  ): Promise<{
    assigned: boolean;
    driverId?: Uuid;
    assignmentId?: Uuid;
    shouldRetry: boolean;
    attempts: number;
  }> {
    return this.dataSource.transaction(async (manager) => {
      const lockResult = await this.lockOrderOrSkip(manager, orderId);

      if (!lockResult) {
        return { assigned: false, shouldRetry: false, attempts: 0 };
      }

      const { order, maxAttempts } = lockResult;

      if (order.status === OrderStatus.FAILED) {
        return {
          assigned: false,
          shouldRetry: false,
          attempts: order.assignmentAttempts,
        };
      }

      const driver = await this.findAndLockDriver(
        manager,
        order.pickupLat,
        order.pickupLng,
        excludeDriverIds,
      );

      if (!driver) {
        await this.logService.warn(
          'OrderService',
          'NO_DRIVER_AVAILABLE',
          `No available driver found for order ${orderId}`,
          { orderId },
        );

        return {
          assigned: false,
          shouldRetry: order.assignmentAttempts < maxAttempts,
          attempts: order.assignmentAttempts,
        };
      }

      const savedAssignment = await this.createAssignmentRecord(
        manager,
        order.id,
        driver.id,
      );

      await this.logService.info(
        'OrderService',
        'ASSIGN_DRIVER',
        `Driver ${driver.id} assigned to order ${orderId}`,
        { orderId, driverId: driver.id },
      );

      return {
        assigned: true,
        driverId: driver.id,
        assignmentId: savedAssignment.id,
        shouldRetry: false,
        attempts: order.assignmentAttempts,
      };
    });
  }

  /**
   * Lock the order row with pessimistic_write_or_fail.
   * Returns null if the row is already locked, or the order + maxAttempts
   * if the order is in a processable state.
   */
  private async lockOrderOrSkip(
    manager: EntityManager,
    orderId: string,
  ): Promise<{ order: OrderEntity; maxAttempts: number } | null> {
    const order = await manager
      .createQueryBuilder(OrderEntity, 'order')
      .setLock('pessimistic_write_or_fail')
      .where('order.id = :orderId', { orderId })
      .getOne()
      .catch(() => null); // SKIP LOCKED → null if already locked

    if (!order) {
      this.logger.warn(
        `Order ${orderId} is locked by another worker, skipping`,
      );

      return null;
    }

    if (
      order.status !== OrderStatus.PENDING &&
      order.status !== OrderStatus.ASSIGNING
    ) {
      this.logger.warn(
        `Order ${orderId} is in ${order.status} state, skipping assignment`,
      );

      return null;
    }

    order.status = OrderStatus.ASSIGNING;
    order.assignmentAttempts += 1;

    const maxAttempts = 3;

    const failed = await this.handleMaxAttempts(manager, order, maxAttempts);

    if (failed) {
      return { order, maxAttempts };
    }

    await manager.save(OrderEntity, order);

    return { order, maxAttempts };
  }

  /**
   * Check if assignment attempts exceeded max.
   * Sets order to FAILED and returns true if max exceeded.
   */
  private async handleMaxAttempts(
    manager: EntityManager,
    order: OrderEntity,
    maxAttempts: number,
  ): Promise<boolean> {
    if (order.assignmentAttempts > maxAttempts) {
      order.status = OrderStatus.FAILED;
      await manager.save(OrderEntity, order);
      await this.logService.error(
        'OrderService',
        'ASSIGNMENT_MAX_ATTEMPTS',
        `Order ${order.id} failed after ${maxAttempts} assignment attempts`,
        { orderId: order.id },
      );

      return true;
    }

    return false;
  }

  /**
   * Find the nearest available driver (excluding given IDs) and mark BUSY.
   * Returns the locked driver entity or null if none found.
   */
  private async findAndLockDriver(
    manager: EntityManager,
    pickupLat: number,
    pickupLng: number,
    excludeDriverIds: Uuid[],
  ): Promise<DriverEntity | null> {
    const driver = await manager
      .createQueryBuilder(DriverEntity, 'driver')
      .setLock('pessimistic_write')
      .where('driver.status = :status', { status: DriverStatus.AVAILABLE })
      .andWhere('driver.isVerified = true')
      .andWhere('driver.latitude IS NOT NULL')
      .andWhere('driver.longitude IS NOT NULL')
      .andWhere(
        excludeDriverIds.length > 0
          ? 'driver.id NOT IN (:...excludeDriverIds)'
          : '1=1',
        excludeDriverIds.length > 0 ? { excludeDriverIds } : {},
      )
      .orderBy(
        `SQRT(POWER(driver.latitude - :lat, 2) + POWER(driver.longitude - :lng, 2))`,
        'ASC',
      )
      .setParameters({
        lat: pickupLat,
        lng: pickupLng,
      })
      .limit(1)
      .getOne();

    if (!driver) {
      return null;
    }

    driver.status = DriverStatus.BUSY;
    await manager.save(DriverEntity, driver);

    return driver;
  }

  /**
   * Create an assignment record with a 60-second expiry.
   */
  private async createAssignmentRecord(
    manager: EntityManager,
    orderId: Uuid,
    driverId: Uuid,
  ): Promise<OrderAssignmentEntity> {
    const expiresAt = new Date(Date.now() + 60_000);
    const assignment = manager.create(OrderAssignmentEntity, {
      orderId,
      driverId,
      status: AssignmentStatus.PENDING,
      expiresAt,
    });

    return manager.save(OrderAssignmentEntity, assignment);
  }

  /**
   * Driver accepts an assignment.
   */
  async acceptAssignment(
    assignmentId: Uuid,
    driverId: Uuid,
  ): Promise<OrderDto> {
    return this.dataSource.transaction(async (manager) => {
      const assignment = await manager.findOne(OrderAssignmentEntity, {
        where: { id: assignmentId },
      });

      if (!assignment) {
        throw new AssignmentNotFoundException();
      }

      if (assignment.driverId !== driverId) {
        throw new BadRequestException('This assignment does not belong to you');
      }

      if (assignment.status !== AssignmentStatus.PENDING) {
        throw new BadRequestException(
          `Assignment is ${assignment.status}, cannot accept`,
        );
      }

      if (new Date() > assignment.expiresAt) {
        throw new BadRequestException('Assignment has expired');
      }

      // Update assignment
      assignment.status = AssignmentStatus.ACCEPTED;
      assignment.respondedAt = new Date();
      await manager.save(OrderAssignmentEntity, assignment);

      // Update order
      const order = await manager.findOneBy(OrderEntity, {
        id: assignment.orderId,
      });

      if (!order) {
        throw new OrderNotFoundException();
      }

      order.status = OrderStatus.ASSIGNED;
      order.assignedDriverId = driverId;
      order.assignedAt = new Date();
      await manager.save(OrderEntity, order);

      await this.logService.info(
        'OrderService',
        'ACCEPT_ASSIGNMENT',
        `Driver ${driverId} accepted order ${order.id}`,
        { orderId: order.id, driverId },
      );

      return order.toDto();
    });
  }

  /**
   * Driver rejects an assignment — triggers re-assignment.
   */
  async rejectAssignment(
    assignmentId: Uuid,
    driverId: Uuid,
  ): Promise<{ orderId: Uuid; shouldReassign: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const assignment = await manager.findOne(OrderAssignmentEntity, {
        where: { id: assignmentId },
      });

      if (!assignment) {
        throw new AssignmentNotFoundException();
      }

      if (assignment.driverId !== driverId) {
        throw new BadRequestException('This assignment does not belong to you');
      }

      if (assignment.status !== AssignmentStatus.PENDING) {
        throw new BadRequestException(
          `Assignment is ${assignment.status}, cannot reject`,
        );
      }

      assignment.status = AssignmentStatus.REJECTED;
      assignment.respondedAt = new Date();
      await manager.save(OrderAssignmentEntity, assignment);

      // Free the driver
      await manager.update(DriverEntity, driverId, {
        status: DriverStatus.AVAILABLE,
      });

      await this.logService.info(
        'OrderService',
        'REJECT_ASSIGNMENT',
        `Driver ${driverId} rejected order ${assignment.orderId}`,
        { orderId: assignment.orderId, driverId },
      );

      return {
        orderId: assignment.orderId,
        shouldReassign: true,
      };
    });
  }

  /**
   * Expire a pending assignment that timed out.
   */
  async expireAssignment(
    assignmentId: Uuid,
  ): Promise<{ orderId: Uuid; driverId: Uuid; shouldReassign: boolean }> {
    return this.dataSource.transaction(async (manager) => {
      const assignment = await manager.findOne(OrderAssignmentEntity, {
        where: { id: assignmentId },
      });

      if (!assignment) {
        throw new AssignmentNotFoundException();
      }

      if (assignment.status !== AssignmentStatus.PENDING) {
        return {
          orderId: assignment.orderId,
          driverId: assignment.driverId,
          shouldReassign: false,
        };
      }

      assignment.status = AssignmentStatus.EXPIRED;
      assignment.respondedAt = new Date();
      await manager.save(OrderAssignmentEntity, assignment);

      // Free the driver
      await manager.update(DriverEntity, assignment.driverId, {
        status: DriverStatus.AVAILABLE,
      });

      await this.logService.warn(
        'OrderService',
        'EXPIRE_ASSIGNMENT',
        `Assignment ${assignmentId} expired for order ${assignment.orderId}`,
        { orderId: assignment.orderId, driverId: assignment.driverId },
      );

      return {
        orderId: assignment.orderId,
        driverId: assignment.driverId,
        shouldReassign: true,
      };
    });
  }

  /**
   * Idempotent order completion.
   * Called when delivery is confirmed (via webhook or direct API).
   */
  async completeOrder(orderId: Uuid): Promise<OrderDto> {
    return this.dataSource.transaction(async (manager) => {
      // Lock the order
      const order = await manager
        .createQueryBuilder(OrderEntity, 'order')
        .setLock('pessimistic_write')
        .where('order.id = :orderId', { orderId })
        .getOne();

      if (!order) {
        throw new OrderNotFoundException();
      }

      // Idempotency: already delivered
      if (order.status === OrderStatus.DELIVERED) {
        return order.toDto();
      }

      if (
        order.status !== OrderStatus.ASSIGNED &&
        order.status !== OrderStatus.PICKED_UP
      ) {
        throw new BadRequestException(
          `Cannot complete order in ${order.status} status`,
        );
      }

      order.status = OrderStatus.DELIVERED;
      order.deliveredAt = new Date();
      await manager.save(OrderEntity, order);

      await this.logService.info(
        'OrderService',
        'COMPLETE_ORDER',
        `Order ${orderId} delivered`,
        { orderId, userId: order.userId },
      );

      return order.toDto();
    });
  }

  /**
   * Get all rejected/expired driver IDs for an order (for exclusion in re-assignment).
   */
  async getFailedDriverIds(orderId: Uuid): Promise<Uuid[]> {
    const assignments = await this.assignmentRepository.find({
      where: [
        { orderId, status: AssignmentStatus.REJECTED },
        { orderId, status: AssignmentStatus.EXPIRED },
      ],
    });

    return assignments.map((a) => a.driverId);
  }
}
