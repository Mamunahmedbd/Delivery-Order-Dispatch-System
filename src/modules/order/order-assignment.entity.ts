import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, ManyToOne } from 'typeorm';

import { AbstractEntity } from '../../common/abstract.entity.ts';
import { AssignmentStatus } from '../../constants/assignment-status.ts';
import { UseDto } from '../../decorators/use-dto.decorator.ts';
import { DriverEntity } from '../driver/driver.entity.ts';
import { OrderEntity } from './order.entity.ts';
import { OrderAssignmentDto } from './dtos/order-assignment.dto.ts';

@Entity({ name: 'order_assignments' })
@UseDto(OrderAssignmentDto)
export class OrderAssignmentEntity extends AbstractEntity<OrderAssignmentDto> {
  @Column({ type: 'uuid' })
  orderId!: Uuid;

  @Column({ type: 'uuid' })
  driverId!: Uuid;

  @Column({
    type: 'enum',
    enum: AssignmentStatus,
    default: AssignmentStatus.PENDING,
  })
  status!: AssignmentStatus;

  @Column({ type: 'timestamp' })
  expiresAt!: Date;

  @Column({ type: 'timestamp', nullable: true })
  respondedAt!: Date | null;

  @ManyToOne(() => OrderEntity, (order) => order.assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'order_id' })
  order!: Relation<OrderEntity>;

  @ManyToOne(() => DriverEntity, (driver) => driver.assignments, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'driver_id' })
  driver!: Relation<DriverEntity>;
}
