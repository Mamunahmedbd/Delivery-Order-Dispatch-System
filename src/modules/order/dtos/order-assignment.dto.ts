import { AbstractDto } from '../../../common/dto/abstract.dto.ts';
import { AssignmentStatus } from '../../../constants/assignment-status.ts';
import {
  DateField,
  DateFieldOptional,
  EnumField,
  UUIDField,
} from '../../../decorators/field.decorators.ts';
import type { OrderAssignmentEntity } from '../order-assignment.entity.ts';

export class OrderAssignmentDto extends AbstractDto {
  @UUIDField()
  orderId!: Uuid;

  @UUIDField()
  driverId!: Uuid;

  @EnumField(() => AssignmentStatus)
  status!: AssignmentStatus;

  @DateField()
  expiresAt!: Date;

  @DateFieldOptional({ nullable: true })
  respondedAt?: Date | null;

  constructor(assignment: OrderAssignmentEntity) {
    super(assignment);
    this.orderId = assignment.orderId;
    this.driverId = assignment.driverId;
    this.status = assignment.status;
    this.expiresAt = assignment.expiresAt;
    this.respondedAt = assignment.respondedAt;
  }
}
