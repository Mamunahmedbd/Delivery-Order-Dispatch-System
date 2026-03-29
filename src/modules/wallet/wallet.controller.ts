import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
} from '@nestjs/common';
import { ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import { RoleType } from '../../constants/role-type.ts';
import { AuthUser } from '../../decorators/auth-user.decorator.ts';
import { Auth } from '../../decorators/http.decorators.ts';
import { UserEntity } from '../user/user.entity.ts';
import { TopUpDto } from './dtos/top-up.dto.ts';
import { WalletDto } from './dtos/wallet.dto.ts';
import { WalletTransactionDto } from './dtos/wallet-transaction.dto.ts';
import { WalletService } from './wallet.service.ts';

@Controller('wallets')
@ApiTags('wallets')
export class WalletController {
  constructor(private readonly walletService: WalletService) {}

  @Get('balance')
  @Auth([RoleType.USER, RoleType.DRIVER, RoleType.ADMIN])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get authenticated user wallet balance' })
  @ApiOkResponse({ type: WalletDto })
  getBalance(@AuthUser() user: UserEntity): Promise<WalletDto> {
    return this.walletService.getBalance(user.id);
  }

  @Post('top-up')
  @Auth([RoleType.USER, RoleType.DRIVER, RoleType.ADMIN])
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Add funds to wallet' })
  @ApiOkResponse({ type: WalletTransactionDto })
  @Throttle({ default: { limit: 3, ttl: 60_000 } })
  topUp(
    @AuthUser() user: UserEntity,
    @Body() dto: TopUpDto,
  ): Promise<WalletTransactionDto> {
    return this.walletService.credit(
      user.id,
      dto.amount,
      'Wallet top-up',
      dto.idempotencyKey,
    );
  }
}
