import { NotFoundException } from '@nestjs/common';

export class AssignmentNotFoundException extends NotFoundException {
  constructor(error?: string) {
    super('error.assignmentNotFound', error);
  }
}
