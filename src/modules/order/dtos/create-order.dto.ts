import { IsNumber, IsString, Max, Min } from 'class-validator';

import {
  NumberField,
  StringField,
} from '../../../decorators/field.decorators.ts';

export class CreateOrderDto {
  @StringField()
  @IsString()
  readonly pickupAddress!: string;

  @NumberField()
  @IsNumber()
  @Min(-90)
  @Max(90)
  readonly pickupLat!: number;

  @NumberField()
  @IsNumber()
  @Min(-180)
  @Max(180)
  readonly pickupLng!: number;

  @StringField()
  @IsString()
  readonly deliveryAddress!: string;

  @NumberField()
  @IsNumber()
  @Min(-90)
  @Max(90)
  readonly deliveryLat!: number;

  @NumberField()
  @IsNumber()
  @Min(-180)
  @Max(180)
  readonly deliveryLng!: number;

  @NumberField()
  @IsNumber()
  @Min(0.01)
  readonly deliveryFee!: number;
}
