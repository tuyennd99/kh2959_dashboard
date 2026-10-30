import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ScheduleModule } from '@nestjs/schedule';
import { AuthController } from './controllers/auth.controller';
import { DashboardController } from './controllers/dashboard.controller';
import { HealthController } from './controllers/health.controller';
import { ManageController } from './controllers/manage.controller';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { PrismaService } from './prisma/prisma.service';
import { AuthService } from './services/auth.service';
import { LandDashboardService } from './services/land-dashboard.service';
import { SheetSyncLockService } from './services/sheet-sync-lock.service';
import { SheetSyncSchedulerService } from './services/sheet-sync-scheduler.service';

@Module({
  imports: [JwtModule.register({}), ScheduleModule.forRoot()],
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
    SheetSyncLockService,
    SheetSyncSchedulerService,
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
  ],
})
export class AppModule {}
