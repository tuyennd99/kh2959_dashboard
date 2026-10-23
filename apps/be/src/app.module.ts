import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './controllers/auth.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { HealthController } from './controllers/health.controller';
import { ManageController } from './controllers/manage.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrismaService } from './prisma/prisma.service';
import { AuthService } from './services/auth.service';
import { LandDashboardService } from './services/land-dashboard.service';

@Module({
  imports: [JwtModule.register({})],
  controllers: [
    HealthController,
    AuthController,
    DashboardController,
    ManageController,
  ],
  providers: [
    PrismaService,
    AuthService,
    LandDashboardService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
