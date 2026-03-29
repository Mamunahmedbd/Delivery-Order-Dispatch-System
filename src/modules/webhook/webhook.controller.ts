import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Logger,
  Post,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiExcludeEndpoint, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';

import type { DeliveryCallbackPayload } from './webhook.service.ts';
import { WebhookService } from './webhook.service.ts';

@Controller('webhooks')
@ApiTags('webhooks')
export class WebhookController {
  private readonly logger = new Logger(WebhookController.name);

  constructor(
    private readonly webhookService: WebhookService,
    private readonly configService: ConfigService,
  ) {}

  @Post('delivery')
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @ApiOperation({
    summary: 'Delivery webhook callback (public, signature-verified)',
  })
  @ApiExcludeEndpoint() // Hide from Swagger as it's a machine-to-machine endpoint
  async deliveryCallback(
    @Body() payload: DeliveryCallbackPayload,
    @Headers('x-webhook-signature') signature?: string,
  ): Promise<{
    processed: boolean;
    alreadyDelivered: boolean;
    success: boolean;
  }> {
    // Verify signature if configured
    const webhookSecret = this.configService.get<string>('WEBHOOK_SECRET');

    if (webhookSecret && signature) {
      const isValid = this.webhookService.verifySignature(
        JSON.stringify(payload),
        signature,
        webhookSecret,
      );

      if (!isValid) {
        this.logger.warn('Invalid webhook signature');

        throw new UnauthorizedException('Invalid webhook signature');
      }
    }

    const result = await this.webhookService.processDeliveryCallback(payload);

    return {
      success: true,
      ...result,
    };
  }
}
