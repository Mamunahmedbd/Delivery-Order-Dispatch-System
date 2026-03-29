import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
} from '@nestjs/common';
import {
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';

import { RoleType } from '../../constants/role-type.ts';
import { AuthUser } from '../../decorators/auth-user.decorator.ts';
import { Auth } from '../../decorators/http.decorators.ts';
import { DriverNotFoundException } from '../../exceptions/driver-not-found.exception.ts';
import { UserEntity } from '../user/user.entity.ts';
import { DriverService } from './driver.service.ts';
import { DriverDto } from './dtos/driver.dto.ts';
import { UpdateLocationDto } from './dtos/update-location.dto.ts';
import { UpdateStatusDto } from './dtos/update-status.dto.ts';

@Controller('drivers')
@ApiTags('drivers')
export class DriverController {
  constructor(private readonly driverService: DriverService) {}

  @Post('register')
  @Auth([RoleType.USER])
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register as a driver (requires USER role)' })
  @ApiCreatedResponse({ type: DriverDto })
  register(@AuthUser() user: UserEntity): Promise<DriverDto> {
    return this.driverService.register(user.id);
  }

  @Patch('location')
  @Auth([RoleType.DRIVER])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update driver GPS location' })
  @ApiOkResponse({ type: DriverDto })
  async updateLocation(
    @AuthUser() user: UserEntity,
    @Body() dto: UpdateLocationDto,
  ): Promise<DriverDto> {
    const driver = await this.driverService.findByUserId(user.id);

    if (!driver) {
      throw new DriverNotFoundException();
    }

    return this.driverService.updateLocation(driver.id, dto.lat, dto.lng);
  }

  @Patch('status')
  @Auth([RoleType.DRIVER])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Update driver online/offline status' })
  @ApiOkResponse({ type: DriverDto })
  async updateStatus(
    @AuthUser() user: UserEntity,
    @Body() dto: UpdateStatusDto,
  ): Promise<DriverDto> {
    const driver = await this.driverService.findByUserId(user.id);

    if (!driver) {
      throw new DriverNotFoundException();
    }

    return this.driverService.updateStatus(driver.id, dto.status);
  }
}
