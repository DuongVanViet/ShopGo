import { Body, Controller, Get, Inject, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Db, one, rows } from '../../database/db';
import { Actor, CurrentActor } from '../../common/context';
import { ownOrder } from '../../common/access';
import { pageSchema, parse, uuid } from '../../common/validation';
import { paginate } from '../catalog/catalog.service';

@ApiBearerAuth()
@ApiTags('Support / Notifications')
@Controller()
export class SupportController {
  constructor(@Inject(Db) private readonly db: Db) {}
  @Post('support/cases') create(@CurrentActor() actor: Actor, @Body() body: unknown) {
    const input = parse(
      z
        .object({
          orderId: uuid.optional(),
          category: z.enum(['ORDER', 'PAYMENT', 'RETURN', 'OTHER']),
          message: z.string().min(3).max(5000),
        })
        .strict(),
      body,
    );
    return this.db.tx(async (tx) => {
      if (input.orderId) await ownOrder(tx, actor, input.orderId);
      return one(
        tx,
        'INSERT INTO support_cases(user_id,order_id,category,message) VALUES($1,$2,$3,$4) RETURNING *',
        [actor.id, input.orderId ?? null, input.category, input.message],
      );
    });
  }
  @Get('support/cases') async list(@CurrentActor() actor: Actor, @Query() query: unknown) {
    const input = parse(pageSchema.strict(), query);
    return paginate(
      await rows(
        this.db.pool,
        'SELECT * FROM support_cases WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',
        [actor.id, input.cursor ?? null, input.limit + 1],
      ),
      input.limit,
    );
  }
  @Get('notifications') async notifications(@CurrentActor() actor: Actor, @Query() query: unknown) {
    const input = parse(pageSchema.strict(), query);
    return paginate(
      await rows(
        this.db.pool,
        'SELECT id,payload,read_at,created_at FROM notification_deliveries WHERE user_id=$1 AND ($2::uuid IS NULL OR id>$2) ORDER BY id LIMIT $3',
        [actor.id, input.cursor ?? null, input.limit + 1],
      ),
      input.limit,
    );
  }
}
