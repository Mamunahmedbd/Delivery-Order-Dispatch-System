import { NotFoundException } from '@nestjs/common';

export class DriverNotFoundException extends NotFoundException {
  constructor(error?: string) {
    super('error.driverNotFound', error);
  }
}
