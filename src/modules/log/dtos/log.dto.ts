import { AbstractDto } from '../../../common/dto/abstract.dto.ts';
import { LogLevel } from '../../../constants/log-level.ts';
import {
  EnumField,
  StringField,
  UUIDFieldOptional,
} from '../../../decorators/field.decorators.ts';
import type { LogEntity } from '../log.entity.ts';

export class LogDto extends AbstractDto {
  @EnumField(() => LogLevel)
  level!: LogLevel;

  @StringField()
  context!: string;

  @StringField()
  action!: string;

  @StringField()
  message!: string;

  metadata?: Record<string, unknown> | null;

  @UUIDFieldOptional({ nullable: true })
  orderId?: Uuid | null;

  @UUIDFieldOptional({ nullable: true })
  driverId?: Uuid | null;

  @UUIDFieldOptional({ nullable: true })
  userId?: Uuid | null;

  constructor(log: LogEntity) {
    super(log);
    this.level = log.level;
    this.context = log.context;
    this.action = log.action;
    this.message = log.message;
    this.metadata = log.metadata;
    this.orderId = log.orderId;
    this.driverId = log.driverId;
    this.userId = log.userId;
  }
}
