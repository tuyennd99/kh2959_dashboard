import { Controller, Get, Query } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../decorators/public.decorator';
import { DashboardQueryDto, ExternalReportQueryDto } from '../dtos/land.dto';
import { LandDashboardService } from '../services/land-dashboard.service';

@ApiTags('Dashboard (Public)')
@Public()
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: LandDashboardService) {}

  @Get('summary')
  getSummary(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getSummary(query);
  }

  @Get('records')
  getRecords(@Query() query: DashboardQueryDto) {
    return this.dashboardService.getRecords(query);
  }

  @Get('fields')
  getFields() {
    return this.dashboardService.getFieldDefinitions();
  }

  @Get('external-report')
  getExternalReport(@Query() query: ExternalReportQueryDto) {
    return this.dashboardService.getExternalReport(query.branch);
  }

  @Get('sheet-modules')
  getSheetModules(@Query('refresh') refresh?: string) {
    if (refresh === '1' || refresh === 'true') {
      return this.dashboardService.syncSheetModules();
    }
    return this.dashboardService.getSheetModules();
  }
}
