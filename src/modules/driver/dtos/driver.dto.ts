import { AbstractDto } from '../../../common/dto/abstract.dto.ts';
import { DriverStatus } from '../../../constants/driver-status.ts';
import {
  BooleanField,
  DateFieldOptional,
  EnumField,
  NumberFieldOptional,
  UUIDField,
} from '../../../decorators/field.decorators.ts';
import type { DriverEntity } from '../driver.entity.ts';

export class DriverDto extends AbstractDto {
  @UUIDField()
  userId!: Uuid;

  @EnumField(() => DriverStatus)
  status!: DriverStatus;

  @NumberFieldOptional({ nullable: true })
  latitude?: number | null;

  @NumberFieldOptional({ nullable: true })
  longitude?: number | null;

  @BooleanField()
  isVerified!: boolean;

  @DateFieldOptional({ nullable: true })
  lastLocationUpdate?: Date | null;

  constructor(driver: DriverEntity) {
    super(driver);
    this.userId = driver.userId;
    this.status = driver.status;
    this.latitude = driver.latitude;
    this.longitude = driver.longitude;
    this.isVerified = driver.isVerified;
    this.lastLocationUpdate = driver.lastLocationUpdate;
  }
}
