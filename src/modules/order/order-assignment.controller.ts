import { Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { CommandBus } from '@nestjs/cqrs';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';

import { RoleType } from '../../constants/role-type.ts';
import { AuthUser } from '../../decorators/auth-user.decorator.ts';
import { Auth, UUIDParam } from '../../decorators/http.decorators.ts';
import { DriverNotFoundException } from '../../exceptions/driver-not-found.exception.ts';
import { DriverService } from '../driver/driver.service.ts';
import { AcceptAssignmentCommand } from '../order/commands/accept-assignment.command.ts';
import { RejectAssignmentCommand } from '../order/commands/reject-assignment.command.ts';
import { UserEntity } from '../user/user.entity.ts';
import { OrderDto } from './dtos/order.dto.ts';

@Controller('assignments')
@ApiTags('assignments')
export class OrderAssignmentController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly driverService: DriverService,
  ) { }

  @Post(':id/accept')
  @Auth([RoleType.DRIVER])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Driver accepts an assignment' })
  @ApiOkResponse({
    description: 'Assignment accepted, order status → ASSIGNED',
    type: OrderDto,
  })
  async accept(
    @UUIDParam('id') assignmentId: Uuid,
    @AuthUser() user: UserEntity,
  ): Promise<OrderDto> {
    const driver = await this.driverService.findByUserId(user.id);

    if (!driver) {
      throw new DriverNotFoundException();
    }

    return this.commandBus.execute(
      new AcceptAssignmentCommand(assignmentId, driver.id),
    );
  }

  @Post(':id/reject')
  @Auth([RoleType.DRIVER])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Driver rejects an assignment (triggers re-assignment)',
  })
  @ApiOkResponse({ description: 'Assignment rejected' })
  async reject(
    @UUIDParam('id') assignmentId: Uuid,
    @AuthUser() user: UserEntity,
  ): Promise<{ orderId: Uuid; shouldReassign: boolean }> {
    const driver = await this.driverService.findByUserId(user.id);

    if (!driver) {
      throw new DriverNotFoundException();
    }

    return this.commandBus.execute(
      new RejectAssignmentCommand(assignmentId, driver.id),
    );
  }
}
