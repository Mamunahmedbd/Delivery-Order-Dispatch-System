import { IsNumber, Max, Min } from 'class-validator';

import { NumberField } from '../../../decorators/field.decorators.ts';

export class UpdateLocationDto {
  @NumberField()
  @IsNumber()
  @Min(-90)
  @Max(90)
  readonly latitude!: number;

  @NumberField()
  @IsNumber()
  @Min(-180)
  @Max(180)
  readonly longitude!: number;
}
