import type { Relation } from 'typeorm';
import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToMany,
} from 'typeorm';

import { AbstractEntity } from '../../common/abstract.entity.ts';
import { OrderStatus } from '../../constants/order-status.ts';
import { UseDto } from '../../decorators/use-dto.decorator.ts';
import { DriverEntity } from '../driver/driver.entity.ts';
import { UserEntity } from '../user/user.entity.ts';
import { OrderAssignmentEntity } from './order-assignment.entity.ts';
import { OrderDto } from './dtos/order.dto.ts';

@Entity({ name: 'orders' })
@UseDto(OrderDto)
export class OrderEntity extends AbstractEntity<OrderDto> {
  @Column({ type: 'uuid' })
  userId!: Uuid;

  @Column({ type: 'uuid', nullable: true })
  assignedDriverId!: Uuid | null;

  @Column({
    type: 'enum',
    enum: OrderStatus,
    default: OrderStatus.PENDING,
  })
  @Index()
  status!: OrderStatus;

  @Column({ type: 'varchar' })
  pickupAddress!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  pickupLat!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  pickupLng!: number;

  @Column({ type: 'varchar' })
  deliveryAddress!: string;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  deliveryLat!: number;

  @Column({ type: 'decimal', precision: 10, scale: 7 })
  deliveryLng!: number;

  @Column({ type: 'decimal', precision: 12, scale: 2 })
  deliveryFee!: number;

  @Column({ type: 'varchar', nullable: true, unique: true })
  idempotencyKey!: string | null;

  @Column({ type: 'int', default: 0 })
  assignmentAttempts!: number;

  @Column({ type: 'timestamp', nullable: true })
  assignedAt!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<UserEntity>;

  @ManyToOne(() => DriverEntity, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assigned_driver_id' })
  assignedDriver!: Relation<DriverEntity> | null;

  @OneToMany(() => OrderAssignmentEntity, (assignment) => assignment.order)
  assignments?: OrderAssignmentEntity[];
}
