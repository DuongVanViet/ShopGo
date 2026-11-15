import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../app.module';
import { JobsService } from './jobs.service';
import { ENV, Env } from '../config/env';

async function main() {
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });
  const jobs = app.get(JobsService);
  const env = app.get<Env>(ENV);
  let running = true;
  process.once('SIGINT', () => {
    running = false;
  });
  process.once('SIGTERM', () => {
    running = false;
  });
  while (running) {
    try {
      await jobs.expire();
      await jobs.dispatch();
    } catch (error) {
      console.error(
        JSON.stringify({
          job: 'worker',
          error: (error as Error).name,
          code: (error as { code?: string }).code,
        }),
      );
    }
    if (running) await new Promise((resolve) => setTimeout(resolve, env.WORKER_INTERVAL_MS));
  }
  await app.close();
}
main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
