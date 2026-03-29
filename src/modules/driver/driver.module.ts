import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { WalletModule } from '../wallet/wallet.module.ts';
import { DriverController } from './driver.controller.ts';
import { DriverEntity } from './driver.entity.ts';
import { DriverService } from './driver.service.ts';

@Module({
  imports: [
    TypeOrmModule.forFeature([DriverEntity]),
    WalletModule,
  ],
  controllers: [DriverController],
  providers: [DriverService],
  exports: [DriverService],
})
export class DriverModule {}
