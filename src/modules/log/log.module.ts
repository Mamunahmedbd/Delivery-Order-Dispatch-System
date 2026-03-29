import { Global, Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';

import { LogEntity } from './log.entity.ts';
import { LogService } from './log.service.ts';

@Global()
@Module({
  imports: [TypeOrmModule.forFeature([LogEntity])],
  providers: [LogService],
  exports: [LogService],
})
export class LogModule {}
