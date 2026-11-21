import {
  Body,
  Controller,
  Get,
  Header,
  Headers,
  Inject,
  Param,
  Post,
  Put,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor, CurrentActor } from '../../common/context';
import { id, parse } from '../../common/validation';
import { StoreChatService } from './store-chat.service';

const paging = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
    before: z.coerce.number().int().positive().optional(),
  })
  .strict();

const message = z
  .object({
    body: z
      .string()
      .trim()
      .min(1)
      .max(2000)
      .refine((value) => !value.includes('\0')),
  })
  .strict();

@ApiBearerAuth()
@ApiTags('Store chat')
@Controller('chat')
export class StoreChatController {
  constructor(@Inject(StoreChatService) private readonly chat: StoreChatService) {}

  @Get('threads')
  @Header('Cache-Control', 'private, no-store')
  customerInbox(@CurrentActor() actor: Actor, @Query() query: unknown) {
    return this.chat.list(actor, null, parse(paging, query));
  }

  @Get('stores/:storeId/threads')
  @Header('Cache-Control', 'private, no-store')
  storeInbox(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Query() query: unknown,
  ) {
    return this.chat.list(actor, id(storeId), parse(paging, query));
  }

  @Get('orders/:orderId/messages')
  @Header('Cache-Control', 'private, no-store')
  history(
    @CurrentActor() actor: Actor,
    @Param('orderId') orderId: string,
    @Query() query: unknown,
  ) {
    return this.chat.history(actor, id(orderId), parse(paging, query));
  }

  @Post('orders/:orderId/messages')
  send(
    @CurrentActor() actor: Actor,
    @Param('orderId') orderId: string,
    @Headers('idempotency-key') key: string | undefined,
    @Body() body: unknown,
  ) {
    const requestKey = parse(z.string().regex(/^[\w.:-]{8,128}$/), key);
    return this.chat.send(actor, id(orderId), requestKey, parse(message, body).body);
  }

  @Put('orders/:orderId/read')
  read(@CurrentActor() actor: Actor, @Param('orderId') orderId: string, @Body() body: unknown) {
    return this.chat.markRead(
      actor,
      id(orderId),
      parse(z.object({ through: z.number().int().positive() }).strict(), body).through,
    );
  }
}
