import { Inject, Injectable, Optional } from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import type { HealthIndicatorResult } from '@nestjs/terminus';
import { HealthIndicatorService } from '@nestjs/terminus';
import { firstValueFrom } from 'rxjs';
import { timeout } from 'rxjs/operators';

@Injectable()
export class ServiceHealthIndicator {
  constructor(
    @Optional()
    @Inject('NATS_SERVICE')
    private readonly clientProxy: ClientProxy | undefined,
    private readonly healthIndicatorService: HealthIndicatorService,
  ) {}

  async isHealthy(eventName: string): Promise<HealthIndicatorResult> {
    const indicator = this.healthIndicatorService.check(eventName);

    try {
      if (!this.clientProxy) {
        return indicator.down({ message: 'NATS client proxy is missing' });
      }

      const result = await firstValueFrom(
        this.clientProxy
          .send<Record<string, unknown> | undefined>(eventName, { check: true })
          .pipe(timeout(10_000)),
        {
          defaultValue: undefined,
        },
      );

      if (result?.status !== 'up') {
        return indicator.down(result);
      }

      return indicator.up(result);
    } catch (error) {
      return indicator.down({
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }
}
