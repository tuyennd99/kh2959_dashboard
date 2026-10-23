import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { ApiExceptionFilter } from '../filters/api-exception.filter';
import { ApiResponseInterceptor } from '../interceptors/api-response.interceptor';
import { env } from './env';

export function configureApp(app: INestApplication) {
  const { allowedOrigins, trustProxyHops } = env(process.env);

  if (trustProxyHops > 0) {
    const express = app.getHttpAdapter().getInstance() as {
      set(name: string, value: number): void;
    };
    express.set('trust proxy', trustProxyHops);
  }

  app.enableCors({
    origin: (
      origin: string | undefined,
      callback: (err: Error | null, allow?: boolean) => void,
    ) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }
      callback(null, false);
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'Accept',
      'Origin',
      'X-Requested-With',
    ],
  });

  app.setGlobalPrefix('api');
  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
  app.useGlobalFilters(new ApiExceptionFilter());
  app.useGlobalInterceptors(new ApiResponseInterceptor());

  const config = new DocumentBuilder()
    .setTitle('Hệ thống Dashboard Dữ liệu Đất đai')
    .setDescription('API thống kê, đồng bộ Google Sheet và nhập liệu dữ liệu đất đai.')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'bearer')
    .build();
  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);
}
