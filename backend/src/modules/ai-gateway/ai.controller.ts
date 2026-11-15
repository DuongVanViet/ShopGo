import { Body, Controller, Get, Header, Headers, Inject, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Db, one } from '../../database/db';
import { Actor, CurrentActor } from '../../common/context';
import { must } from '../../common/errors';
import { id, parse, uuid, version } from '../../common/validation';
import { CatalogService } from '../catalog/catalog.service';
import { AiService, proposalInput } from './ai.service';

@ApiBearerAuth()
@ApiTags('AI Gateway')
@Controller()
export class AiController {
  constructor(
    @Inject(Db) private readonly db: Db,
    @Inject(CatalogService) private readonly catalog: CatalogService,
    @Inject(AiService) private readonly ai: AiService,
  ) {}
  @Post('assistant/conversations') async conversation(
    @CurrentActor() actor: Actor,
    @Body() body: unknown,
  ) {
    const input = parse(z.object({ storeId: uuid }).strict(), body);
    must(
      await one(this.db.pool, "SELECT id FROM stores WHERE id=$1 AND status='ACTIVE'", [
        input.storeId,
      ]),
    );
    return one(
      this.db.pool,
      'INSERT INTO conversations(user_id,store_id) VALUES($1,$2) RETURNING *',
      [actor.id, input.storeId],
    );
  }
  @Post('assistant/conversations/:id/messages') @Header('Cache-Control', 'no-store') async message(
    @CurrentActor() actor: Actor,
    @Param('id') conversation: string,
    @Body() body: unknown,
  ) {
    const input = parse(
      z
        .object({
          message: z.string().min(1).max(3000),
          budget: z.number().int().positive().optional(),
          constraints: z.array(z.string().max(200)).max(10).optional(),
        })
        .strict(),
      body,
    );
    return this.ai.message(actor, id(conversation), input);
  }
  @Post('assistant/proposals')
  @Header('Cache-Control', 'no-store')
  proposal(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.ai.create(actor, parse(proposalInput, body));
  }
  @Get('assistant/proposals/:id')
  @Header('Cache-Control', 'no-store')
  getProposal(@CurrentActor() actor: Actor, @Param('id') proposal: string) {
    return this.ai.get(actor, id(proposal));
  }
  @Post('assistant/proposals/:id/apply')
  apply(
    @CurrentActor() actor: Actor,
    @Param('id') proposal: string,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
  ) {
    return this.ai.apply(
      actor,
      id(proposal),
      parse(
        z
          .object({ confirmationToken: z.string().min(32).max(256), expectedCartVersion: version })
          .strict(),
        body,
      ),
      key,
    );
  }
  @Get('recommendations') async recommendations(@Query() query: unknown) {
    const input = parse(
      z.object({ storeId: uuid, q: z.string().max(100).optional() }).strict(),
      query,
    );
    return {
      strategy: 'catalog-in-stock-baseline',
      personalized: false,
      ...(await this.catalog.products(input.storeId, { q: input.q, inStock: true, limit: 10 })),
    };
  }
}
