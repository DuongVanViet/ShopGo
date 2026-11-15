import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { z } from 'zod';
import { Actor, CurrentActor } from '../../common/context';
import { id, parse, uuid, version } from '../../common/validation';
import { CartService } from './cart.service';

@ApiBearerAuth()
@ApiTags('Cart / Checkout')
@Controller()
export class CartController {
  constructor(@Inject(CartService) private readonly cart: CartService) {}
  @Get('cart') get(@CurrentActor() actor: Actor, @Query() query: unknown) {
    return this.cart.get(actor, parse(z.object({ storeId: uuid }).strict(), query).storeId);
  }
  @Put('cart/items/:skuId') put(
    @CurrentActor() actor: Actor,
    @Param('skuId') sku: string,
    @Body() body: unknown,
  ) {
    return this.cart.change(
      actor,
      id(sku),
      parse(
        z
          .object({
            storeId: uuid,
            quantity: z.number().int().min(1).max(1000),
            expectedVersion: version,
          })
          .strict(),
        body,
      ),
    );
  }
  @Delete('cart/items/:skuId') remove(
    @CurrentActor() actor: Actor,
    @Param('skuId') sku: string,
    @Body() body: unknown,
  ) {
    return this.cart.change(
      actor,
      id(sku),
      parse(z.object({ storeId: uuid, expectedVersion: version }).strict(), body),
    );
  }
  @Post('checkout/quotes') quote(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.cart.quote(
      actor,
      parse(
        z
          .object({
            cartId: uuid,
            cartVersion: version,
            slotId: uuid,
            voucherCode: z.string().min(1).max(40).optional(),
          })
          .strict(),
        body,
      ),
    );
  }
  @Post('cart/switch-store') switchStore(@CurrentActor() actor: Actor, @Body() body: unknown) {
    return this.cart.switchStore(
      actor,
      parse(
        z
          .object({
            sourceStoreId: uuid,
            targetStoreId: uuid,
            expectedVersion: version,
            expectedTargetVersion: version.optional(),
            confirm: z.boolean(),
          })
          .strict(),
        body,
      ),
    );
  }
}
