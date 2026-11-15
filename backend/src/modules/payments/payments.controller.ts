import { Body, Controller, Headers, HttpCode, Inject, Param, Post, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Public } from '../auth/auth.guard';
import { Actor, ApiRequest, CurrentActor } from '../../common/context';
import { id, money, parse, uuid, version } from '../../common/validation';
import { PaymentsService } from './payments.service';

@ApiBearerAuth()
@ApiTags('Payments')
@Controller()
export class PaymentsController {
  constructor(@Inject(PaymentsService) private readonly payments: PaymentsService) {}
  @Post('orders/:id/payment-attempts') attempt(
    @CurrentActor() actor: Actor,
    @Param('id') order: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.payments.attempt(
      actor,
      id(order),
      parse(z.object({ expectedVersion: version }).strict(), body),
      key,
    );
  }
  @Post('orders/:id/payment-attempts/:attemptId/confirm-sandbox')
  @HttpCode(200)
  confirmSandboxPayment(
    @CurrentActor() actor: Actor,
    @Param('id') order: string,
    @Param('attemptId') attempt: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: ApiRequest,
  ) {
    return this.payments.confirmSandboxPayment(
      actor,
      id(order),
      id(attempt),
      parse(z.object({ expectedVersion: version }).strict(), body),
      key,
      request.requestId,
    );
  }
  @Public()
  @Post('webhooks/payments/:provider')
  @HttpCode(200)
  webhook(
    @Param('provider') provider: string,
    @Body() body: unknown,
    @Headers('x-webhook-timestamp') timestamp: string | undefined,
    @Headers('x-webhook-signature') signature: string | undefined,
    @Req() req: ApiRequest,
  ) {
    const input = parse(
      z
        .object({
          eventId: uuid,
          reference: uuid,
          merchant: z.string().max(100),
          amount: money,
          currency: z.literal('VND'),
          status: z.enum(['PAID', 'FAILED']),
        })
        .strict(),
      body,
    );
    return this.payments.webhook(
      provider,
      req.rawBody ?? Buffer.alloc(0),
      timestamp,
      signature,
      input,
    );
  }
  @Post('stores/:storeId/refunds') refund(
    @CurrentActor() actor: Actor,
    @Param('storeId') store: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: ApiRequest,
  ) {
    const input = parse(
      z
        .object({
          paymentId: uuid,
          amount: money.refine((v) => v > 0),
          reason: z.string().min(3).max(500),
        })
        .strict(),
      body,
    );
    return this.payments.refund(actor, id(store), input, key, req.requestId);
  }
  @Post('stores/:storeId/refunds/:refundId/confirm-sandbox') confirm(
    @CurrentActor() actor: Actor,
    @Param('storeId') store: string,
    @Param('refundId') refund: string,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: ApiRequest,
  ) {
    return this.payments.confirmSandboxRefund(actor, id(store), id(refund), key, req.requestId);
  }
}
