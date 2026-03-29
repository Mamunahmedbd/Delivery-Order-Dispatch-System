import { ICommand } from '@nestjs/cqrs';

export class ProcessAssignmentCommand implements ICommand {
  constructor(
    public readonly orderId: Uuid,
    public readonly excludeDriverIds: Uuid[],
  ) {}
}
