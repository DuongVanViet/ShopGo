import { Body, Controller, Get, Headers, Inject, Patch, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Db, one } from '../../database/db';
import { Actor, ApiRequest, CurrentActor } from '../../common/context';
import { expected } from '../../common/access';
import { must } from '../../common/errors';
import { audit } from '../../common/events';
import { idempotent } from '../../common/idempotency';
import { parse } from '../../common/validation';
import { fullAddress, updateLocationSchema } from '../auth/auth.dto';

@ApiBearerAuth()
@ApiTags('Seller')
@Controller('seller/store')
export class SellerController {
  constructor(@Inject(Db) private readonly db: Db) {}
  @Get() async get(@CurrentActor() actor: Actor) {
    return must(
      await one(
        this.db.pool,
        'SELECT * FROM stores WHERE owner_user_id=$1 ORDER BY created_at,id LIMIT 1',
        [actor.id],
      ),
    );
  }
  @Patch('location') update(
    @CurrentActor() actor: Actor,
    @Body() body: unknown,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: ApiRequest,
  ) {
    const input = parse(updateLocationSchema, body);
    return this.db.tx((tx) =>
      idempotent(tx, actor.id, 'seller.location', key, input, async () => {
        const store = must(
          await one(
            tx,
            'SELECT * FROM stores WHERE owner_user_id=$1 ORDER BY created_at,id LIMIT 1 FOR UPDATE',
            [actor.id],
          ),
        );
        expected({ version: store.location_version }, input.expectedVersion);
        const loc = input.location;
        const updated = await one(
          tx,
          `UPDATE stores SET address=$2,address_details=$3,latitude=$4,longitude=$5,location_source=$6,
        location_accuracy_meters=$7,location_confirmed_at=clock_timestamp(),location_version=location_version+1 WHERE id=$1 RETURNING *`,
          [
            store.id,
            fullAddress(input.address),
            JSON.stringify(input.address),
            loc.latitude,
            loc.longitude,
            loc.source,
            loc.source === 'GPS' ? (loc.accuracyMeters ?? null) : null,
          ],
        );
        await audit(tx, actor.id, 'seller.location.update', 'store', store.id, req.requestId, {
          source: loc.source,
          version: store.location_version + 1,
        });
        return updated;
      }),
    );
  }
}
