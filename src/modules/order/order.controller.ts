import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { CommandBus, QueryBus } from '@nestjs/cqrs';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { RoleType } from '../../constants/role-type.ts';
import { AuthUser } from '../../decorators/auth-user.decorator.ts';
import { Auth, UUIDParam } from '../../decorators/http.decorators.ts';
import { UserEntity } from '../user/user.entity.ts';
import { CreateOrderCommand } from './commands/create-order.command.ts';
import { CreateOrderDto } from './dtos/create-order.dto.ts';
import { OrderDto } from './dtos/order.dto.ts';
import { GetOrderQuery } from './queries/get-order.query.ts';
import { GetUserOrdersQuery } from './queries/get-user-orders.query.ts';

@Controller('orders')
@ApiTags('orders')
export class OrderController {
  constructor(
    private readonly commandBus: CommandBus,
    private readonly queryBus: QueryBus,
  ) {}

  @Post()
  @Auth([RoleType.USER, RoleType.ADMIN])
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @ApiOperation({ summary: 'Create a delivery order' })
  @ApiCreatedResponse({ description: 'Order created', type: OrderDto })
  @HttpCode(HttpStatus.CREATED)
  create(
    @AuthUser() user: UserEntity,
    @Body() dto: CreateOrderDto,
  ): Promise<OrderDto> {
    return this.commandBus.execute(new CreateOrderCommand(user.id, dto));
  }

  @Get(':id')
  @Auth([RoleType.USER, RoleType.DRIVER, RoleType.ADMIN])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get order details by ID' })
  @ApiOkResponse({ description: 'Order found', type: OrderDto })
  get(@UUIDParam('id') id: Uuid): Promise<OrderDto> {
    return this.queryBus.execute(new GetOrderQuery(id));
  }

  @Get()
  @Auth([RoleType.USER, RoleType.ADMIN])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: "Get current user's orders" })
  @ApiOkResponse({ description: 'Order list', type: [OrderDto] })
  getUserOrders(@AuthUser() user: UserEntity): Promise<OrderDto[]> {
    return this.queryBus.execute(new GetUserOrdersQuery(user.id));
  }
}
