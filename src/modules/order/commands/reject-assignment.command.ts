import { ICommand } from '@nestjs/cqrs';

export class RejectAssignmentCommand implements ICommand {
  constructor(
    public readonly assignmentId: Uuid,
    public readonly driverId: Uuid,
  ) {}
}
