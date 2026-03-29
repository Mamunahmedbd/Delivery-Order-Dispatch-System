import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

import {
  NumberField,
  StringFieldOptional,
} from '../../../decorators/field.decorators.ts';

export class TopUpDto {
  @NumberField()
  @IsNumber()
  @Min(0.01)
  readonly amount!: number;

  @StringFieldOptional()
  @IsOptional()
  @IsString()
  readonly idempotencyKey?: string;
}
