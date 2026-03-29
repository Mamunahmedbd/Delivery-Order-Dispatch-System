import { AbstractDto } from '../../../common/dto/abstract.dto.ts';
import { OrderStatus } from '../../../constants/order-status.ts';
import {
  DateFieldOptional,
  EnumField,
  NumberField,
  StringField,
  StringFieldOptional,
  UUIDField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators.ts';
import type { OrderEntity } from '../order.entity.ts';

export class OrderDto extends AbstractDto {
  @UUIDField()
  userId!: Uuid;

  @UUIDFieldOptional({ nullable: true })
  assignedDriverId?: Uuid | null;

  @EnumField(() => OrderStatus)
  status!: OrderStatus;

  @StringField()
  pickupAddress!: string;

  @NumberField()
  pickupLat!: number;

  @NumberField()
  pickupLng!: number;

  @StringField()
  deliveryAddress!: string;

  @NumberField()
  deliveryLat!: number;

  @NumberField()
  deliveryLng!: number;

  @NumberField()
  deliveryFee!: number;

  @StringFieldOptional({ nullable: true })
  idempotencyKey?: string | null;

  @NumberField({ int: true })
  assignmentAttempts!: number;

  @DateFieldOptional({ nullable: true })
  assignedAt?: Date | null;

  @DateFieldOptional({ nullable: true })
  deliveredAt?: Date | null;

  constructor(order: OrderEntity) {
    super(order);
    this.userId = order.userId;
    this.assignedDriverId = order.assignedDriverId;
    this.status = order.status;
    this.pickupAddress = order.pickupAddress;
    this.pickupLat = order.pickupLat;
    this.pickupLng = order.pickupLng;
    this.deliveryAddress = order.deliveryAddress;
    this.deliveryLat = order.deliveryLat;
    this.deliveryLng = order.deliveryLng;
    this.deliveryFee = order.deliveryFee;
    this.idempotencyKey = order.idempotencyKey;
    this.assignmentAttempts = order.assignmentAttempts;
    this.assignedAt = order.assignedAt;
    this.deliveredAt = order.deliveredAt;
  }
}
