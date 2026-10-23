import {
  Body,
  Controller,
  Delete,
  Param,
  Post,
  Put,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ResponseMessage } from '../decorators/response-message.decorator';
import {
  CreateFieldDefinitionDto,
  ImportCsvDto,
  SyncSheetDto,
  UpsertLandRecordDto,
} from '../dtos/land.dto';
import { LandDashboardService } from '../services/land-dashboard.service';

@ApiTags('Manage (Authenticated)')
@ApiBearerAuth('bearer')
@Controller('manage')
export class ManageController {
  constructor(private readonly dashboardService: LandDashboardService) {}

  @Post('sync-sheet')
  @ResponseMessage('Đồng bộ dữ liệu từ Google Sheet thành công')
  syncSheet(@Body() dto: SyncSheetDto) {
    return this.dashboardService.syncFromGoogleSheet(dto);
  }

  @Post('import-csv')
  @ResponseMessage('Nhập dữ liệu từ CSV thành công')
  importCsv(@Body() dto: ImportCsvDto) {
    return this.dashboardService.importFromCsv(dto);
  }

  @Post('records')
  @ResponseMessage('Lưu bản ghi thành công')
  upsertRecord(@Body() dto: UpsertLandRecordDto) {
    return this.dashboardService.upsertRecord(dto);
  }

  @Put('records/:id')
  @ResponseMessage('Cập nhật bản ghi thành công')
  updateRecord(@Param('id') id: string, @Body() dto: UpsertLandRecordDto) {
    return this.dashboardService.updateRecordById(id, dto);
  }

  @Delete('records/:id')
  @ResponseMessage('Xóa bản ghi thành công')
  deleteRecord(@Param('id') id: string) {
    return this.dashboardService.deleteRecord(id);
  }

  @Post('fields')
  @ResponseMessage('Thêm trường dữ liệu mới thành công')
  createField(@Body() dto: CreateFieldDefinitionDto) {
    return this.dashboardService.createFieldDefinition(dto);
  }

  @Delete('fields/:id')
  @ResponseMessage('Xóa trường dữ liệu thành công')
  deleteField(@Param('id') id: string) {
    return this.dashboardService.deleteFieldDefinition(id);
  }
}
