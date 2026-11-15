import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { AppModule } from './app.module';
import { ENV, Env } from './config/env';
import { ApiExceptionFilter, EnvelopeInterceptor, requestContext } from './common/http';

export async function createApp() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    rawBody: true,
    logger: process.env.NODE_ENV === 'test' ? false : ['log', 'warn', 'error'],
  });
  const env = app.get<Env>(ENV);
  const productImageDirectory = resolve(env.UPLOAD_DIR, 'products');
  const avatarDirectory = resolve(env.UPLOAD_DIR, 'avatars');
  mkdirSync(productImageDirectory, { recursive: true });
  mkdirSync(avatarDirectory, { recursive: true });
  app.setGlobalPrefix('api/v1');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useStaticAssets(productImageDirectory, {
    prefix: '/api/v1/media/products/',
    index: false,
    immutable: true,
    maxAge: '1y',
  });
  app.useStaticAssets(avatarDirectory, {
    prefix: '/api/v1/media/avatars/',
    index: false,
    immutable: true,
    maxAge: '1y',
  });
  app.use(requestContext);
  // Nest's body parser is installed before routes; enforce an explicit small body limit.
  app.useBodyParser('json', { limit: '64kb' });
  app.enableCors({
    origin: env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()),
    credentials: false,
  });
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new EnvelopeInterceptor());
  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ShopGo Backend')
      .setDescription(
        'MVP Click & Collect API; see backend/README.md for request examples and integration limits.',
      )
      .setVersion('0.1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, config));
  }
  app.enableShutdownHooks();
  return app;
}
