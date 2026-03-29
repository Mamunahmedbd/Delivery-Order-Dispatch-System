import { ICommand } from '@nestjs/cqrs';

export class ExpireAssignmentCommand implements ICommand {
  constructor(public readonly assignmentId: Uuid) {}
}
