import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WalletController } from './wallet.controller.ts';
import { WalletEntity } from './wallet.entity.ts';
import { WalletService } from './wallet.service.ts';
import { WalletTransactionEntity } from './wallet-transaction.entity.ts';

@Module({
  imports: [TypeOrmModule.forFeature([WalletEntity, WalletTransactionEntity])],
  controllers: [WalletController],
  providers: [WalletService],
  exports: [WalletService],
})
export class WalletModule {}
