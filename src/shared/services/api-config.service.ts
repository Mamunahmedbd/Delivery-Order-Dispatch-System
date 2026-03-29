import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { ThrottlerOptions } from '@nestjs/throttler';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';
import parse from 'parse-duration';

import { CreateDeliverySchema1711700000000 } from '../../database/migrations/1711700000000-create-delivery-schema.ts';
import { AlterWalletPrecision1711800000000 } from '../../database/migrations/1711800000000-alter-wallet-precision.ts';
import { UserSubscriber } from '../../entity-subscribers/user-subscriber.ts';
import { DriverEntity } from '../../modules/driver/driver.entity.ts';
import { LogEntity } from '../../modules/log/log.entity.ts';
import { OrderEntity } from '../../modules/order/order.entity.ts';
import { OrderAssignmentEntity } from '../../modules/order/order-assignment.entity.ts';
import { UserEntity } from '../../modules/user/user.entity.ts';
import { WalletEntity } from '../../modules/wallet/wallet.entity.ts';
import { WalletTransactionEntity } from '../../modules/wallet/wallet-transaction.entity.ts';
import { SnakeNamingStrategy } from '../../snake-naming.strategy.ts';

@Injectable()
export class ApiConfigService {
  constructor(private configService: ConfigService) {}

  get isDevelopment(): boolean {
    return this.nodeEnv === 'development';
  }

  get isProduction(): boolean {
    return this.nodeEnv === 'production';
  }

  get isTest(): boolean {
    return this.nodeEnv === 'test';
  }

  private getNumber(key: string): number {
    const value = this.get(key);
    const num = Number(value);

    if (Number.isNaN(num)) {
      throw new TypeError(
        `Environment variable ${key} must be a number. Received: ${value}`,
      );
    }

    return num;
  }

  private getDuration(
    key: string,
    format?: Parameters<typeof parse>[1],
  ): number {
    const value = this.getString(key);
    const duration = parse(value, format);

    if (duration === null) {
      throw new Error(
        `Environment variable ${key} must be a valid duration. Received: ${value}`,
      );
    }

    return duration;
  }

  private getBoolean(key: string): boolean {
    const value = this.get(key);

    try {
      return Boolean(JSON.parse(value));
    } catch {
      throw new Error(
        `Environment variable ${key} must be a boolean. Received: ${value}`,
      );
    }
  }

  private getString(key: string, defaultValue?: string): string {
    const value = this.configService.get<string>(key);

    if (value === undefined) {
      if (defaultValue !== undefined) {
        return defaultValue;
      }

      throw new Error(`${key} environment variable doesn't exist`);
    }

    return value.replaceAll(String.raw`\n`, '\n');
  }

  get nodeEnv(): string {
    return this.getString('NODE_ENV');
  }

  get fallbackLanguage(): string {
    return this.getString('FALLBACK_LANGUAGE');
  }

  get throttlerConfigs(): ThrottlerOptions {
    return {
      ttl: this.getDuration('THROTTLER_TTL', 'second'),
      limit: this.getNumber('THROTTLER_LIMIT'),
    };
  }

  get postgresConfig(): TypeOrmModuleOptions {
    const entities = [
      UserEntity,
      DriverEntity,
      OrderEntity,
      OrderAssignmentEntity,
      WalletEntity,
      WalletTransactionEntity,
      LogEntity,
    ];
    const migrations = [CreateDeliverySchema1711700000000, AlterWalletPrecision1711800000000];

    return {
      entities,
      migrations,
      dropSchema: this.isTest,
      type: 'postgres',
      host: this.getString('DB_HOST'),
      port: this.getNumber('DB_PORT'),
      username: this.getString('DB_USERNAME'),
      password: this.getString('DB_PASSWORD'),
      database: this.getString('DB_DATABASE'),
      subscribers: [UserSubscriber],
      migrationsRun: true,
      logging: this.getBoolean('ENABLE_ORM_LOGS'),
      namingStrategy: new SnakeNamingStrategy(),
    };
  }

  get redisConfig(): {
    host: string;
    port: number;
    password?: string;
    tls?: object;
  } {
    const redisUrl = this.getString('REDIS_URL');
    const url = new URL(redisUrl);

    const config: {
      host: string;
      port: number;
      password?: string;
      tls?: object;
    } = {
      host: url.hostname,
      port: Number(url.port) || 6379,
    };

    if (url.password) {
      config.password = url.password;
    }

    // TLS for rediss:// protocol
    if (url.protocol === 'rediss:') {
      config.tls = {};
    }

    return config;
  }

  get bullMqConfig(): {
    connection: {
      host: string;
      port: number;
      password?: string;
      tls?: object;
    };
  } {
    return {
      connection: this.redisConfig,
    };
  }

  get driverAssignmentTimeoutMs(): number {
    return this.getNumber('DRIVER_ASSIGNMENT_TIMEOUT_MS');
  }

  get maxAssignmentAttempts(): number {
    return this.getNumber('MAX_ASSIGNMENT_ATTEMPTS');
  }

  get webhookSecret(): string {
    return this.getString('WEBHOOK_SECRET', '');
  }

  get awsS3Config(): {
    bucketRegion: string;
    bucketApiVersion: string;
    bucketName: string;
  } {
    return {
      bucketRegion: this.getString('AWS_S3_BUCKET_REGION'),
      bucketApiVersion: this.getString('AWS_S3_API_VERSION'),
      bucketName: this.getString('AWS_S3_BUCKET_NAME'),
    };
  }

  get documentationEnabled(): boolean {
    return this.getBoolean('ENABLE_DOCUMENTATION');
  }

  get natsEnabled(): boolean {
    return this.getBoolean('NATS_ENABLED');
  }

  get natsConfig(): { host: string; port: number } {
    return {
      host: this.getString('NATS_HOST'),
      port: this.getNumber('NATS_PORT'),
    };
  }

  get authConfig(): {
    privateKey: string;
    publicKey: string;
    jwtExpirationTime: number;
  } {
    return {
      privateKey: this.getString('JWT_PRIVATE_KEY'),
      publicKey: this.getString('JWT_PUBLIC_KEY'),
      jwtExpirationTime: this.getNumber('JWT_EXPIRATION_TIME'),
    };
  }

  get appConfig(): { port: string } {
    return {
      port: this.getString('PORT'),
    };
  }

  private get(key: string): string {
    const value = this.configService.get<string>(key);

    if (value == null) {
      throw new Error(`Environment variable ${key} is not set`);
    }

    return value;
  }
}
