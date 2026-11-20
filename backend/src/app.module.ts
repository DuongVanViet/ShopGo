import { Global, Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { Db } from './database/db';
import { ENV, loadEnv } from './config/env';
import { AuthGuard } from './modules/auth/auth.guard';
import { AuthService } from './modules/auth/auth.service';
import { AuthController } from './modules/auth/auth.controller';
import {
  CatalogController,
  ProductDiscoveryController,
} from './modules/catalog/catalog.controller';
import { CatalogService } from './modules/catalog/catalog.service';
import { FavoritesController } from './modules/catalog/favorites.controller';
import { FavoritesService } from './modules/catalog/favorites.service';
import { CartController } from './modules/cart/cart.controller';
import { CartService } from './modules/cart/cart.service';
import { OrdersController } from './modules/orders/orders.controller';
import { OrdersService } from './modules/orders/orders.service';
import { FulfillmentController } from './modules/fulfillment/fulfillment.controller';
import { FulfillmentService } from './modules/fulfillment/fulfillment.service';
import { PaymentsController } from './modules/payments/payments.controller';
import { PaymentsService } from './modules/payments/payments.service';
import { InventoryController } from './modules/inventory/inventory.controller';
import { InventoryService } from './modules/inventory/inventory.service';
import { ManagementController } from './modules/stores/management.controller';
import { ManagementService } from './modules/stores/management.service';
import { SellerController } from './modules/stores/seller.controller';
import { SupportController } from './modules/notifications/support.controller';
import { AiController } from './modules/ai-gateway/ai.controller';
import { AiService } from './modules/ai-gateway/ai.service';
import { HealthController } from './health.controller';
import { JobsService } from './jobs/jobs.service';
import { PromotionsController } from './modules/promotions/promotions.controller';
import { PromotionsService } from './modules/promotions/promotions.service';

@Global()
@Module({ providers: [{ provide: ENV, useFactory: loadEnv }, Db], exports: [ENV, Db] })
class InfrastructureModule {}
@Module({ controllers: [AuthController], providers: [AuthService], exports: [AuthService] })
class AuthModule {}
@Module({
  controllers: [CatalogController, ProductDiscoveryController, FavoritesController],
  providers: [CatalogService, FavoritesService],
  exports: [CatalogService],
})
class CatalogModule {}
@Module({ controllers: [CartController], providers: [CartService], exports: [CartService] })
class CartModule {}
@Module({ controllers: [OrdersController], providers: [OrdersService] })
class OrdersModule {}
@Module({ controllers: [FulfillmentController], providers: [FulfillmentService] })
class FulfillmentModule {}
@Module({ controllers: [PaymentsController], providers: [PaymentsService] })
class PaymentsModule {}
@Module({ controllers: [InventoryController], providers: [InventoryService] })
class InventoryModule {}
@Module({
  controllers: [ManagementController, SellerController, PromotionsController],
  providers: [ManagementService, PromotionsService],
})
class ManagementModule {}
@Module({ controllers: [SupportController] })
class NotificationsModule {}
@Module({
  imports: [CatalogModule, CartModule, AuthModule],
  controllers: [AiController],
  providers: [AiService],
})
class AiGatewayModule {}
@Module({
  imports: [
    InfrastructureModule,
    AuthModule,
    CatalogModule,
    CartModule,
    OrdersModule,
    FulfillmentModule,
    PaymentsModule,
    InventoryModule,
    ManagementModule,
    NotificationsModule,
    AiGatewayModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }, JobsService],
})
export class AppModule {}
