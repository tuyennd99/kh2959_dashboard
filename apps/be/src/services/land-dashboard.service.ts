import {
  HttpException,
  HttpStatus,
  Injectable,
  Logger,
  OnModuleInit,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type {
  CommuneSummaryItem,
  DailySummaryItem,
  DashboardSummaryDto,
  ExternalChuanHoaReportDto,
  FieldDefinitionDto,
  LandStatRecordDto,
  MetricPair,
  SyncLogDto,
} from '@land/shared';
import { env } from '../config/env';
import {
  CreateFieldDefinitionDto,
  DashboardQueryDto,
  ImportCsvDto,
  SyncSheetDto,
  UpsertLandRecordDto,
} from '../dtos/land.dto';
import { PrismaService } from '../prisma/prisma.service';
import {
  normalizeGoogleSheetExportUrl,
  parseSheetCsv,
} from '../utils/sheet-parser';

export const RETIRED_FIELD_CODE = 'THREE_OLD_DISTRICTS';

export const CORE_FIELD_DEFINITIONS = [
  {
    code: 'OWNER_MISMATCH',
    label: 'Sai Lệch Thông Tin CSH',
    sheetAlias: 'SAI LỆCH THÔNG TIN',
    unit: 'sổ / thửa',
    isDefault: true,
    sortOrder: 1,
  },
  {
    code: 'OUT_OF_LIST_GCN',
    label: 'GCN Ngoài Danh Sách',
    sheetAlias: 'NGOÀI DANH SÁCH',
    unit: 'sổ / thửa',
    isDefault: true,
    sortOrder: 2,
  },
  {
    code: 'STANDARDIZED_MAP_SHEETS',
    label: 'Số lượng tờ bản đồ đã chuẩn hóa',
    sheetAlias: 'TỜ BẢN ĐỒ ĐÃ CHUẨN HÓA',
    unit: 'tờ / thửa',
    isDefault: true,
    sortOrder: 3,
  },
];

@Injectable()
export class LandDashboardService implements OnModuleInit {
  private readonly logger = new Logger(LandDashboardService.name);

  constructor(private readonly prisma: PrismaService) {}

  async onModuleInit() {
    for (const def of CORE_FIELD_DEFINITIONS) {
      await this.prisma.fieldDefinition.upsert({
        where: { code: def.code },
        update: {
          label: def.label,
          sheetAlias: def.sheetAlias,
          isDefault: true,
        },
        create: def,
      });
    }
  }

  async getFieldDefinitions(): Promise<FieldDefinitionDto[]> {
    const rows = await this.prisma.fieldDefinition.findMany({
      where: { code: { not: RETIRED_FIELD_CODE } },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    return rows.map((r) => ({
      id: r.id,
      code: r.code,
      label: r.label,
      sheetAlias: r.sheetAlias,
      unit: r.unit,
      isDefault: r.isDefault,
      sortOrder: r.sortOrder,
    }));
  }

  async createFieldDefinition(
    dto: CreateFieldDefinitionDto,
  ): Promise<FieldDefinitionDto> {
    const code = dto.code.trim().toUpperCase();
    const count = await this.prisma.fieldDefinition.count();
    const created = await this.prisma.fieldDefinition.create({
      data: {
        code,
        label: dto.label.trim(),
        sheetAlias: dto.sheetAlias?.trim() || dto.label.trim().toUpperCase(),
        unit: dto.unit?.trim() || 'sổ / thửa',
        isDefault: false,
        sortOrder: count + 1,
      },
    });
    return {
      id: created.id,
      code: created.code,
      label: created.label,
      sheetAlias: created.sheetAlias,
      unit: created.unit,
      isDefault: created.isDefault,
      sortOrder: created.sortOrder,
    };
  }

  async deleteFieldDefinition(id: string) {
    const field = await this.prisma.fieldDefinition.findUnique({
      where: { id },
    });
    if (!field) {
      throw new HttpException(
        { message: 'Trường dữ liệu không tồn tại' },
        HttpStatus.NOT_FOUND,
      );
    }
    if (field.isDefault) {
      throw new HttpException(
        { message: 'Không thể xóa trường mặc định của hệ thống' },
        HttpStatus.BAD_REQUEST,
      );
    }
    await this.prisma.fieldDefinition.delete({ where: { id } });
    return { deleted: true };
  }

  private buildWhereClause(
    query: DashboardQueryDto,
  ): Prisma.LandStatRecordWhereInput {
    const where: Prisma.LandStatRecordWhereInput = {
      NOT: { fieldCode: RETIRED_FIELD_CODE },
    };
    if (query.fromDate || query.toDate) {
      where.reportDate = {};
      if (query.fromDate) {
        where.reportDate.gte = new Date(`${query.fromDate}T00:00:00.000Z`);
      }
      if (query.toDate) {
        where.reportDate.lte = new Date(`${query.toDate}T23:59:59.999Z`);
      }
    }
    if (query.fieldCode && query.fieldCode !== 'ALL') {
      where.fieldCode = query.fieldCode;
    }
    if (query.commune && query.commune !== 'ALL') {
      where.commune = query.commune === '__EMPTY__' ? '' : query.commune;
    }
    if (query.search?.trim()) {
      const q = query.search.trim();
      where.OR = [
        { commune: { contains: q, mode: 'insensitive' } },
        { note: { contains: q, mode: 'insensitive' } },
        { fieldCode: { contains: q, mode: 'insensitive' } },
      ];
    }
    return where;
  }

  private formatDateIso(date: Date): string {
    return date.toISOString().slice(0, 10);
  }

  async getSummary(query: DashboardQueryDto): Promise<DashboardSummaryDto> {
    const [fields, records, allCommuneRows, lastSyncRow] = await Promise.all([
      this.getFieldDefinitions(),
      this.prisma.landStatRecord.findMany({
        where: this.buildWhereClause(query),
        orderBy: [{ reportDate: 'asc' }, { commune: 'asc' }],
      }),
      this.prisma.landStatRecord.findMany({
        where: { NOT: { fieldCode: RETIRED_FIELD_CODE } },
        select: { commune: true },
        distinct: ['commune'],
      }),
      this.prisma.syncLog.findFirst({
        orderBy: { syncedAt: 'desc' },
      }),
    ]);

    const totalsByField: Record<string, MetricPair> = {};
    for (const f of fields) {
      totalsByField[f.code] = { bookCount: 0, parcelCount: 0 };
    }

    const grandTotal: MetricPair = { bookCount: 0, parcelCount: 0 };
    const dateMap = new Map<string, DailySummaryItem>();
    const communeMap = new Map<string, CommuneSummaryItem>();

    for (const rec of records) {
      const dateStr = this.formatDateIso(rec.reportDate);
      if (!totalsByField[rec.fieldCode]) {
        totalsByField[rec.fieldCode] = { bookCount: 0, parcelCount: 0 };
      }
      totalsByField[rec.fieldCode].bookCount += rec.bookCount;
      totalsByField[rec.fieldCode].parcelCount += rec.parcelCount;

      grandTotal.bookCount += rec.bookCount;
      grandTotal.parcelCount += rec.parcelCount;

      let dayItem = dateMap.get(dateStr);
      if (!dayItem) {
        dayItem = {
          reportDate: dateStr,
          values: {},
          totalBooks: 0,
          totalParcels: 0,
        };
        dateMap.set(dateStr, dayItem);
      }
      if (!dayItem.values[rec.fieldCode]) {
        dayItem.values[rec.fieldCode] = { bookCount: 0, parcelCount: 0 };
      }
      dayItem.values[rec.fieldCode].bookCount += rec.bookCount;
      dayItem.values[rec.fieldCode].parcelCount += rec.parcelCount;
      dayItem.totalBooks += rec.bookCount;
      dayItem.totalParcels += rec.parcelCount;

      const communeName = rec.commune.trim();
      if (communeName) {
        let commItem = communeMap.get(communeName);
        if (!commItem) {
          commItem = {
            commune: communeName,
            bookCount: 0,
            parcelCount: 0,
            byField: {},
          };
          communeMap.set(communeName, commItem);
        }
        commItem.bookCount += rec.bookCount;
        commItem.parcelCount += rec.parcelCount;
        if (!commItem.byField[rec.fieldCode]) {
          commItem.byField[rec.fieldCode] = { bookCount: 0, parcelCount: 0 };
        }
        commItem.byField[rec.fieldCode].bookCount += rec.bookCount;
        commItem.byField[rec.fieldCode].parcelCount += rec.parcelCount;
      }
    }

    const communes = (allCommuneRows ?? [])
      .map((r) => r.commune.trim())
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b, 'vi'));

    const lastSync: SyncLogDto | null = lastSyncRow
      ? {
          id: lastSyncRow.id,
          source: lastSyncRow.source,
          sheetUrl: lastSyncRow.sheetUrl,
          recordsSynced: lastSyncRow.recordsSynced,
          status: lastSyncRow.status,
          message: lastSyncRow.message,
          syncedAt: lastSyncRow.syncedAt.toISOString(),
        }
      : null;

    return {
      fields,
      totalsByField,
      grandTotal,
      byDate: Array.from(dateMap.values()).sort((a, b) =>
        a.reportDate.localeCompare(b.reportDate),
      ),
      byCommune: Array.from(communeMap.values()).sort(
        (a, b) => b.parcelCount - a.parcelCount || b.bookCount - a.bookCount,
      ),
      communes,
      lastSync,
    };
  }

  async getRecords(query: DashboardQueryDto) {
    const page = query.page && query.page > 0 ? query.page : 1;
    const limit =
      query.limit && query.limit > 0 ? Math.min(query.limit, 200) : 50;
    const where = this.buildWhereClause(query);

    const [fields, total, rows] = await Promise.all([
      this.getFieldDefinitions(),
      this.prisma.landStatRecord.count({ where }),
      this.prisma.landStatRecord.findMany({
        where,
        orderBy: [
          { reportDate: 'desc' },
          { fieldCode: 'asc' },
          { commune: 'asc' },
        ],
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    const fieldLabelMap = new Map(fields.map((f) => [f.code, f.label]));

    const data: LandStatRecordDto[] = rows.map((r) => ({
      id: r.id,
      reportDate: this.formatDateIso(r.reportDate),
      fieldCode: r.fieldCode,
      fieldLabel: fieldLabelMap.get(r.fieldCode) ?? r.fieldCode,
      commune: r.commune,
      bookCount: r.bookCount,
      parcelCount: r.parcelCount,
      extraData: (r.extraData as Record<string, number | string> | null) ?? null,
      source: r.source,
      note: r.note,
      updatedAt: r.updatedAt.toISOString(),
    }));

    return {
      data,
      meta: {
        page,
        limit,
        total,
        totalPages: Math.max(1, Math.ceil(total / limit)),
      },
    };
  }

  async upsertRecord(dto: UpsertLandRecordDto): Promise<LandStatRecordDto> {
    const commune = (dto.commune ?? '').trim();
    const reportDate = new Date(`${dto.reportDate}T00:00:00.000Z`);

    const fieldExists = await this.prisma.fieldDefinition.findUnique({
      where: { code: dto.fieldCode },
    });
    if (!fieldExists || fieldExists.code === RETIRED_FIELD_CODE) {
      throw new HttpException(
        { message: `Mã trường dữ liệu '${dto.fieldCode}' không tồn tại` },
        HttpStatus.BAD_REQUEST,
      );
    }

    const record = await this.prisma.landStatRecord.upsert({
      where: {
        reportDate_fieldCode_commune: {
          reportDate,
          fieldCode: dto.fieldCode,
          commune,
        },
      },
      update: {
        bookCount: dto.bookCount,
        parcelCount: dto.parcelCount,
        extraData: dto.extraData
          ? (dto.extraData as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        note: dto.note?.trim() || null,
        source: 'MANUAL',
      },
      create: {
        reportDate,
        fieldCode: dto.fieldCode,
        commune,
        bookCount: dto.bookCount,
        parcelCount: dto.parcelCount,
        extraData: dto.extraData
          ? (dto.extraData as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        note: dto.note?.trim() || null,
        source: 'MANUAL',
      },
    });

    return {
      id: record.id,
      reportDate: this.formatDateIso(record.reportDate),
      fieldCode: record.fieldCode,
      fieldLabel: fieldExists.label,
      commune: record.commune,
      bookCount: record.bookCount,
      parcelCount: record.parcelCount,
      extraData:
        (record.extraData as Record<string, number | string> | null) ?? null,
      source: record.source,
      note: record.note,
      updatedAt: record.updatedAt.toISOString(),
    };
  }

  async updateRecordById(
    id: string,
    dto: UpsertLandRecordDto,
  ): Promise<LandStatRecordDto> {
    const commune = (dto.commune ?? '').trim();
    const reportDate = new Date(`${dto.reportDate}T00:00:00.000Z`);
    const updated = await this.prisma.landStatRecord.update({
      where: { id },
      data: {
        reportDate,
        fieldCode: dto.fieldCode,
        commune,
        bookCount: dto.bookCount,
        parcelCount: dto.parcelCount,
        extraData: dto.extraData
          ? (dto.extraData as Prisma.InputJsonValue)
          : Prisma.JsonNull,
        note: dto.note?.trim() || null,
        source: 'MANUAL',
      },
    });
    return {
      id: updated.id,
      reportDate: this.formatDateIso(updated.reportDate),
      fieldCode: updated.fieldCode,
      commune: updated.commune,
      bookCount: updated.bookCount,
      parcelCount: updated.parcelCount,
      extraData:
        (updated.extraData as Record<string, number | string> | null) ?? null,
      source: updated.source,
      note: updated.note,
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteRecord(id: string) {
    await this.prisma.landStatRecord.delete({ where: { id } });
    return { deleted: true };
  }

  async syncFromGoogleSheet(dto: SyncSheetDto): Promise<SyncLogDto> {
    const config = env(process.env);
    const rawUrl = dto.sheetUrl?.trim() || config.googleSheetCsvUrl;
    const exportUrl = normalizeGoogleSheetExportUrl(rawUrl);

    let csvText: string;
    try {
      const response = await fetch(exportUrl, {
        headers: { Accept: 'text/csv,text/plain,*/*' },
      });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      csvText = await response.text();
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Không thể tải dữ liệu từ Google Sheet';
      await this.prisma.syncLog.create({
        data: {
          source: 'SHEET_SYNC',
          sheetUrl: exportUrl,
          recordsSynced: 0,
          status: 'FAILED',
          message: msg,
        },
      });
      throw new HttpException(
        { message: `Đồng bộ Google Sheet thất bại: ${msg}` },
        HttpStatus.BAD_GATEWAY,
      );
    }

    return this.applyCsvRecords(
      csvText,
      'SHEET_SYNC',
      exportUrl,
      dto.replaceExisting ?? false,
    );
  }

  async importFromCsv(dto: ImportCsvDto): Promise<SyncLogDto> {
    return this.applyCsvRecords(
      dto.csvContent,
      'CSV_UPLOAD',
      null,
      dto.replaceExisting ?? false,
    );
  }

  private async applyCsvRecords(
    csvText: string,
    source: 'SHEET_SYNC' | 'CSV_UPLOAD',
    sheetUrl: string | null,
    replaceExisting: boolean,
  ): Promise<SyncLogDto> {
    const fields = await this.getFieldDefinitions();
    const parsedRows = parseSheetCsv(csvText, fields);

    if (parsedRows.length === 0) {
      throw new HttpException(
        {
          message:
            'Không tìm thấy dòng dữ liệu hợp lệ trong bảng (kiểm tra cột LOẠI DỮ LIỆU, NGÀY THỰC HIỆN, SỐ SỔ, SỐ THỬA)',
        },
        HttpStatus.BAD_REQUEST,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      if (replaceExisting && source === 'SHEET_SYNC') {
        await tx.landStatRecord.deleteMany({
          where: { source: 'SHEET_SYNC' },
        });
      }

      for (const row of parsedRows) {
        const reportDate = new Date(`${row.reportDate}T00:00:00.000Z`);
        await tx.landStatRecord.upsert({
          where: {
            reportDate_fieldCode_commune: {
              reportDate,
              fieldCode: row.fieldCode,
              commune: row.commune,
            },
          },
          update: {
            bookCount: row.bookCount,
            parcelCount: row.parcelCount,
            source,
          },
          create: {
            reportDate,
            fieldCode: row.fieldCode,
            commune: row.commune,
            bookCount: row.bookCount,
            parcelCount: row.parcelCount,
            source,
          },
        });
      }
    });

    const log = await this.prisma.syncLog.create({
      data: {
        source,
        sheetUrl,
        recordsSynced: parsedRows.length,
        status: 'SUCCESS',
        message: `Đã đồng bộ thành công ${parsedRows.length} nhóm dữ liệu (gộp theo Ngày + Loại dữ liệu + Xã)`,
      },
    });

    return {
      id: log.id,
      source: log.source,
      sheetUrl: log.sheetUrl,
      recordsSynced: log.recordsSynced,
      status: log.status,
      message: log.message,
      syncedAt: log.syncedAt.toISOString(),
    };
  }

  async getExternalReport(
    branch?: string,
  ): Promise<ExternalChuanHoaReportDto> {
    const { chuanHoaApiUrl, chuanHoaApiToken } = env(process.env);
    const trimmedBranch = branch?.trim() ?? '';
    const targetUrl = trimmedBranch
      ? `${chuanHoaApiUrl}?branch=${encodeURIComponent(trimmedBranch)}`
      : chuanHoaApiUrl;

    try {
      const headers: Record<string, string> = {
        Accept: 'application/json',
      };
      if (chuanHoaApiToken) {
        headers.Authorization = `Bearer ${chuanHoaApiToken}`;
      }

      const response = await fetch(targetUrl, { headers });
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const data = (await response.json()) as ExternalChuanHoaReportDto;
      return {
        generated_at: data.generated_at ?? '',
        files: data.files ?? {
          total: 0,
          da_chuan: 0,
          chua_chuan: 0,
          bo_qua: 0,
        },
        folders: data.folders ?? {
          total: 0,
          da_chuan: 0,
          chua_chuan: 0,
          bo_qua: 0,
        },
        boxes: data.boxes ?? { total: 0 },
        gcn_total: data.gcn_total ?? 0,
        branches: Array.isArray(data.branches) ? data.branches : [],
        branch: data.branch ?? trimmedBranch,
        available: true,
      };
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Không thể kết nối API chuẩn hóa';
      this.logger.warn(`External report API error: ${msg}`);
      return {
        generated_at: '',
        files: { total: 0, da_chuan: 0, chua_chuan: 0, bo_qua: 0 },
        folders: { total: 0, da_chuan: 0, chua_chuan: 0, bo_qua: 0 },
        boxes: { total: 0 },
        gcn_total: 0,
        branches: ['VPĐKĐĐ KV Hà Quảng', 'VPĐKĐĐ KV Nguyên Bình'],
        branch: trimmedBranch,
        available: false,
        errorMessage: msg,
      };
    }
  }
}
