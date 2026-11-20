import { Controller, Delete, Get, Header, Inject, Param, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor, CurrentActor } from '../../common/context';
import { id } from '../../common/validation';
import { FavoritesService } from './favorites.service';

@ApiBearerAuth()
@ApiTags('Favorites')
@Controller('me/favorites')
export class FavoritesController {
  constructor(@Inject(FavoritesService) private readonly favorites: FavoritesService) {}

  @Get()
  @Header('Cache-Control', 'private, no-store')
  list(@CurrentActor() actor: Actor) {
    return this.favorites.list(actor);
  }

  @Put(':storeId/:skuId')
  save(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Param('skuId') skuId: string,
  ) {
    return this.favorites.save(actor, id(storeId), id(skuId));
  }

  @Delete(':storeId/:skuId')
  remove(
    @CurrentActor() actor: Actor,
    @Param('storeId') storeId: string,
    @Param('skuId') skuId: string,
  ) {
    return this.favorites.remove(actor, id(storeId), id(skuId));
  }
}
