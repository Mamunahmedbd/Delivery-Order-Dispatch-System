import { NotFoundException } from '@nestjs/common';

export class OrderNotFoundException extends NotFoundException {
  constructor(error?: string) {
    super('error.orderNotFound', error);
  }
}
