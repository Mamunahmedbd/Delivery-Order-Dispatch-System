import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';

import { LogLevel } from '../../constants/log-level.ts';
import { LogEntity } from './log.entity.ts';

export interface ILogOptions {
  orderId?: Uuid;
  driverId?: Uuid;
  userId?: Uuid;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class LogService {
  private readonly logger = new Logger(LogService.name);

  constructor(
    @InjectRepository(LogEntity)
    private readonly logRepository: Repository<LogEntity>,
  ) {}

  async log(
    level: LogLevel,
    context: string,
    action: string,
    message: string,
    options?: ILogOptions,
  ): Promise<void> {
    try {
      const logEntry = this.logRepository.create({
        level,
        context,
        action,
        message,
        metadata: options?.metadata ?? null,
        orderId: options?.orderId ?? null,
        driverId: options?.driverId ?? null,
        userId: options?.userId ?? null,
      });

      await this.logRepository.save(logEntry);

      // Also emit to NestJS console logger
      switch (level) {
        case LogLevel.ERROR: {
          this.logger.error(
            `[${context}:${action}] ${message}`,
            options?.metadata,
          );
          break;
        }

        case LogLevel.WARN: {
          this.logger.warn(
            `[${context}:${action}] ${message}`,
            options?.metadata,
          );
          break;
        }

        default: {
          this.logger.log(
            `[${context}:${action}] ${message}`,
            options?.metadata,
          );
        }
      }
    } catch (error: unknown) {
      // Logging should never crash the application
      this.logger.error('Failed to persist log entry', error);
    }
  }

  info(
    context: string,
    action: string,
    message: string,
    options?: ILogOptions,
  ): Promise<void> {
    return this.log(LogLevel.INFO, context, action, message, options);
  }

  warn(
    context: string,
    action: string,
    message: string,
    options?: ILogOptions,
  ): Promise<void> {
    return this.log(LogLevel.WARN, context, action, message, options);
  }

  error(
    context: string,
    action: string,
    message: string,
    options?: ILogOptions,
  ): Promise<void> {
    return this.log(LogLevel.ERROR, context, action, message, options);
  }
}
