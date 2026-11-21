import { Body, Controller, Get, Header, Inject, Param, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor, CurrentActor } from '../../common/context';
import { id, pageSchema, parse } from '../../common/validation';
import { Public } from '../auth/auth.guard';
import { StoreReviewsService } from './store-reviews.service';

const reviewInput = z
  .object({
    rating: z.number().int().min(1).max(5),
    comment: z
      .string()
      .trim()
      .max(500)
      .refine((value) => !value.includes('\0'))
      .default(''),
  })
  .strict();

@ApiTags('Store reviews')
@Controller()
export class StoreReviewsController {
  constructor(@Inject(StoreReviewsService) private readonly reviews: StoreReviewsService) {}

  @Public()
  @Get('stores/:storeId/reviews')
  list(@Param('storeId') storeId: string, @Query() query: unknown) {
    return this.reviews.list(id(storeId), parse(pageSchema.strict(), query));
  }

  @ApiBearerAuth()
  @Get('orders/:orderId/review')
  @Header('Cache-Control', 'private, no-store')
  get(@CurrentActor() actor: Actor, @Param('orderId') orderId: string) {
    return this.reviews.get(actor, id(orderId));
  }

  @ApiBearerAuth()
  @Put('orders/:orderId/review')
  save(@CurrentActor() actor: Actor, @Param('orderId') orderId: string, @Body() body: unknown) {
    return this.reviews.save(actor, id(orderId), parse(reviewInput, body));
  }
}
