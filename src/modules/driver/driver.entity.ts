import type { Relation } from 'typeorm';
import { Column, Entity, JoinColumn, OneToMany, OneToOne } from 'typeorm';

import { AbstractEntity } from '../../common/abstract.entity.ts';
import { DriverStatus } from '../../constants/driver-status.ts';
import { UseDto } from '../../decorators/use-dto.decorator.ts';
import { DriverDto } from './dtos/driver.dto.ts';
import { OrderAssignmentEntity } from '../order/order-assignment.entity.ts';
import { UserEntity } from '../user/user.entity.ts';

@Entity({ name: 'drivers' })
@UseDto(DriverDto)
export class DriverEntity extends AbstractEntity<DriverDto> {
  @Column({ type: 'uuid' })
  userId!: Uuid;

  @Column({
    type: 'enum',
    enum: DriverStatus,
    default: DriverStatus.OFFLINE,
  })
  status!: DriverStatus;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  latitude!: number | null;

  @Column({ type: 'decimal', precision: 10, scale: 7, nullable: true })
  longitude!: number | null;

  @Column({ default: false })
  isVerified!: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lastLocationUpdate!: Date | null;

  @OneToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: Relation<UserEntity>;

  @OneToMany(() => OrderAssignmentEntity, (assignment) => assignment.driver)
  assignments?: OrderAssignmentEntity[];
}
