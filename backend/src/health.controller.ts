import { Controller, Get, Inject } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Db } from './database/db';
import { migrationFiles } from './database/migrate';
import { fail } from './common/errors';
import { Public } from './modules/auth/auth.guard';

@Public()
@ApiTags('Health')
@Controller('health')
export class HealthController {
  private readonly versions = migrationFiles();
  constructor(@Inject(Db) private readonly db: Db) {}
  @Get('live') live() {
    return { status: 'ok' };
  }
  @Get('ready') async ready() {
    try {
      const migration = await this.db.pool.query(
        'SELECT version FROM schema_migrations WHERE version = ANY($1::text[])',
        [this.versions],
      );
      if (migration.rowCount !== this.versions.length)
        fail('NOT_READY', 'Migration chưa hoàn tất.', 503);
      await this.db.pool.query('SELECT id FROM orders LIMIT 0');
      return { status: 'ready', database: 'up' };
    } catch {
      fail('NOT_READY', 'Database hoặc migration chưa sẵn sàng.', 503);
    }
  }
}
