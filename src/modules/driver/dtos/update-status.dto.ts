import { IsEnum } from 'class-validator';

import { DriverStatus } from '../../../constants/driver-status.ts';
import { EnumField } from '../../../decorators/field.decorators.ts';

export class UpdateStatusDto {
  @EnumField(() => DriverStatus)
  @IsEnum(DriverStatus)
  readonly status!: DriverStatus;
}
