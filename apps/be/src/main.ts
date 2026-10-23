import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureApp } from './config/app';
import { env } from './config/env';

async function bootstrap() {
  const config = env(process.env);
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureApp(app);
  app.enableShutdownHooks();

  await app.listen(config.port);
  const logger = new Logger('Main');
  logger.log(`Application is running on: ${await app.getUrl()}`);
}

void bootstrap();
