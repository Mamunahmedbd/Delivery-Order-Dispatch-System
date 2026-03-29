import { ICommand } from '@nestjs/cqrs';

export class AcceptAssignmentCommand implements ICommand {
  constructor(
    public readonly assignmentId: Uuid,
    public readonly driverId: Uuid,
  ) {}
}
