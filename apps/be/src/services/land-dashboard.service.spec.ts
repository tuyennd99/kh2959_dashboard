import { LandDashboardService } from './land-dashboard.service';
import type { SheetSyncLockService, SyncLease } from './sheet-sync-lock.service';
import type { PrismaService } from '../prisma/prisma.service';

describe('LandDashboardService', () => {
  const mockFields = [
    {
      id: 'f1',
      code: 'OWNER_MISMATCH',
      label: 'Sai Lệch Thông Tin CSH',
      sheetAlias: 'SAI LỆCH THÔNG TIN',
      unit: 'sổ / thửa',
      isDefault: true,
      sortOrder: 1,
    },
    {
      id: 'f2',
      code: 'OUT_OF_LIST_GCN',
      label: 'GCN Ngoài Danh Sách',
      sheetAlias: 'NGOÀI DANH SÁCH',
      unit: 'sổ / thửa',
      isDefault: true,
      sortOrder: 2,
    },
    {
      id: 'f4',
      code: 'STANDARDIZED_MAP_SHEETS',
      label: 'Số lượng tờ bản đồ đã chuẩn hóa',
      sheetAlias: 'TỜ BẢN ĐỒ ĐÃ CHUẨN HÓA',
      unit: 'tờ',
      isDefault: true,
      sortOrder: 3,
    },
    {
      id: 'f5',
      code: 'SPATIAL_PARCELS',
      label: 'Số thửa không gian',
      sheetAlias: null,
      unit: 'thửa',
      isDefault: true,
      sortOrder: 4,
    },
  ];

  function createMockPrisma() {
    const prisma = {
      fieldDefinition: {
        findMany: jest.fn().mockResolvedValue(mockFields),
        upsert: jest.fn().mockResolvedValue(mockFields[0]),
      },
      landStatRecord: {
        findMany: jest.fn().mockResolvedValue([
          {
            id: 'r1',
            reportDate: new Date('2026-10-18T00:00:00.000Z'),
            fieldCode: 'OWNER_MISMATCH',
            commune: 'Độc Lập',
            bookCount: 132,
            parcelCount: 1032,
            extraData: null,
            source: 'SHEET_SYNC',
            note: null,
            updatedAt: new Date('2026-10-18T00:00:00.000Z'),
          },
        ]),
        createMany: jest.fn().mockResolvedValue({ count: 0 }),
        upsert: jest.fn().mockResolvedValue({}),
        deleteMany: jest.fn().mockResolvedValue({ count: 0 }),
      },
      syncLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
        upsert: jest.fn().mockResolvedValue({}),
        create: jest.fn().mockImplementation(async ({ data }) => {
          prisma.syncLog.findUnique.mockResolvedValue(data);
          return { ...data, syncedAt: new Date() };
        }),
      },
      $executeRaw: jest.fn().mockResolvedValue(1),
      $transaction: jest.fn(),
    };
    prisma.$transaction.mockImplementation(
      (callback: (tx: typeof prisma) => Promise<unknown>) => callback(prisma),
    );
    return prisma as unknown as PrismaService;
  }

  function createDashboardService(
    prisma: PrismaService,
    syncLock?: SheetSyncLockService,
  ) {
    const defaultLock = {
      withSheetSyncLock: async (work: (lease: SyncLease) => Promise<unknown>) =>
        work({ token: 1n, isActive: () => true }),
      assertCurrentSheetSyncLease: jest.fn().mockResolvedValue(undefined),
    };
    return new LandDashboardService(
      prisma,
      syncLock ?? (defaultLock as unknown as SheetSyncLockService),
    );
  }

  it('computes totalsByField, grandTotal, byDate, and byCommune accurately', async () => {
    const prisma = createMockPrisma();
    const service = createDashboardService(prisma);
    const summary = await service.getSummary({});

    expect(summary.grandTotal).toEqual({ bookCount: 132, parcelCount: 1032 });
    expect(summary.totalsByField.OWNER_MISMATCH).toEqual({
      bookCount: 132,
      parcelCount: 1032,
    });
    expect(summary.totalsByField.STANDARDIZED_MAP_SHEETS).toEqual({
      bookCount: 0,
      parcelCount: 0,
    });
    expect(summary.byDate).toHaveLength(1);
    expect(summary.byDate[0].reportDate).toBe('2026-10-18');
    expect(summary.byCommune).toEqual([
      {
        commune: 'Độc Lập',
        bookCount: 132,
        parcelCount: 1032,
        byField: {
          OWNER_MISMATCH: { bookCount: 132, parcelCount: 1032 },
        },
      },
    ]);
  });

  it('copies existing GCN records only once across service restarts', async () => {
    const prisma = createMockPrisma();
    const sourceRecord = {
      id: 'gcn-1',
      reportDate: new Date('2026-10-18T00:00:00.000Z'),
      fieldCode: 'OUT_OF_LIST_GCN',
      commune: 'Độc Lập',
      bookCount: 132,
      parcelCount: 1032,
      extraData: null,
      source: 'SHEET_SYNC',
      note: null,
      updatedAt: new Date('2026-10-18T00:00:00.000Z'),
    };
    (prisma.landStatRecord.findMany as unknown as jest.Mock).mockResolvedValue([
      sourceRecord,
    ]);

    (prisma.landStatRecord.createMany as jest.Mock).mockResolvedValue({
      count: 1,
    });
    await createDashboardService(prisma).onModuleInit();
    // Later GCN records must not become new spatial records on restart.
    (prisma.landStatRecord.findMany as jest.Mock).mockResolvedValue([
      { ...sourceRecord, commune: 'Quảng Uyên', parcelCount: 2000 },
    ]);
    await createDashboardService(prisma).onModuleInit();

    expect(prisma.landStatRecord.createMany).toHaveBeenCalledTimes(1);
    expect(prisma.landStatRecord.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: [
          expect.objectContaining({
            reportDate: sourceRecord.reportDate,
            fieldCode: 'SPATIAL_PARCELS',
            commune: sourceRecord.commune,
            bookCount: sourceRecord.bookCount,
            parcelCount: sourceRecord.parcelCount,
          }),
        ],
        skipDuplicates: true,
      }),
    );
    expect(prisma.syncLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        id: 'SPATIAL_PARCELS_INITIAL_COPY',
        source: 'INITIAL_COPY',
        recordsSynced: 1,
        status: 'SUCCESS',
      }),
    });
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(2);
  });

  it('marks an empty initial snapshot complete without copying future GCN records', async () => {
    const prisma = createMockPrisma();
    (prisma.landStatRecord.findMany as jest.Mock).mockResolvedValue([]);
    await createDashboardService(prisma).onModuleInit();
    await createDashboardService(prisma).onModuleInit();

    expect(prisma.landStatRecord.findMany).toHaveBeenCalledTimes(1);
    expect(prisma.landStatRecord.createMany).not.toHaveBeenCalled();
    expect(prisma.syncLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ recordsSynced: 0, status: 'SUCCESS' }),
    });
  });

  it('retries a failed copy without marking it complete', async () => {
    const prisma = createMockPrisma();
    (prisma.landStatRecord.createMany as jest.Mock).mockRejectedValueOnce(
      new Error('Copy failed'),
    );
    await expect(
      createDashboardService(prisma).onModuleInit(),
    ).rejects.toThrow('Copy failed');
    expect(prisma.syncLog.create).not.toHaveBeenCalled();

    await createDashboardService(prisma).onModuleInit();
    expect(prisma.landStatRecord.createMany).toHaveBeenCalledTimes(2);
    expect(prisma.syncLog.create).toHaveBeenCalledTimes(1);
  });

  it.each(['OUT_OF_LIST_GCN', 'SPATIAL_PARCELS'])(
    'allows independent create, update and delete for %s',
    async (fieldCode) => {
      const prisma = createMockPrisma();
      const dto = {
        reportDate: '2026-10-18',
        fieldCode,
        commune: 'Độc Lập',
        bookCount: 12,
        parcelCount: 150,
      };
      const record = {
        ...dto,
        id: 'record-1',
        reportDate: new Date(`${dto.reportDate}T00:00:00.000Z`),
        updatedAt: new Date(),
      };
      prisma.fieldDefinition.findUnique = jest
        .fn()
        .mockResolvedValue(
          mockFields.find((field) => field.code === fieldCode),
        );
      prisma.landStatRecord.upsert = jest.fn().mockResolvedValue(record);
      prisma.landStatRecord.update = jest.fn().mockResolvedValue(record);
      prisma.landStatRecord.delete = jest.fn().mockResolvedValue(record);

      const service = createDashboardService(prisma);
      await service.upsertRecord(dto);
      await service.updateRecordById(record.id, dto);
      await service.deleteRecord(record.id);

      expect(prisma.landStatRecord.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.landStatRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ fieldCode }),
        }),
      );
      expect(prisma.landStatRecord.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: record.id } }),
      );
      expect(prisma.landStatRecord.delete).toHaveBeenCalledWith({
        where: { id: record.id },
      });
      expect(prisma.$transaction).not.toHaveBeenCalled();
    },
  );

  it('preserves spatial snapshots when replacing Google Sheet data', async () => {
    const prisma = createMockPrisma();
    prisma.landStatRecord.deleteMany = jest
      .fn()
      .mockResolvedValue({ count: 1 });
    prisma.landStatRecord.upsert = jest.fn().mockResolvedValue({});
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '1,GCN Ngoài Danh Sách,18/10/2026,Độc Lập,,132,1032',
    } as Response);
    try {
      await createDashboardService(prisma).syncFromGoogleSheet({
        replaceExisting: true,
      });

      expect(prisma.landStatRecord.deleteMany).toHaveBeenCalledWith({
        where: { source: 'SHEET_SYNC', fieldCode: { not: 'SPATIAL_PARCELS' } },
      });
      expect(prisma.landStatRecord.upsert).toHaveBeenCalledTimes(1);
      expect(prisma.landStatRecord.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({ fieldCode: 'OUT_OF_LIST_GCN' }),
        }),
      );
      expect(prisma.landStatRecord.createMany).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('keeps spatial copies visible without adding them to overall totals', async () => {
    const prisma = createMockPrisma();
    const reportDate = new Date('2026-10-18T00:00:00.000Z');
    const records = [
      {
        id: 'gcn-1',
        reportDate,
        fieldCode: 'OUT_OF_LIST_GCN',
        commune: 'Độc Lập',
        bookCount: 132,
        parcelCount: 1032,
        extraData: null,
        source: 'SHEET_SYNC',
        note: null,
        updatedAt: reportDate,
      },
      {
        id: 'spatial-1',
        reportDate,
        fieldCode: 'SPATIAL_PARCELS',
        commune: 'Độc Lập',
        bookCount: 132,
        parcelCount: 1032,
        extraData: null,
        source: 'SHEET_SYNC',
        note: null,
        updatedAt: reportDate,
      },
    ];
    const findMany = prisma.landStatRecord.findMany as unknown as jest.Mock;
    findMany.mockImplementation(
      ({ where }: { where?: { fieldCode?: string } }) =>
        Promise.resolve(
          where?.fieldCode
            ? records.filter((record) => record.fieldCode === where.fieldCode)
            : records,
        ),
    );

    const service = createDashboardService(prisma);
    const summary = await service.getSummary({});

    expect(summary.totalsByField.SPATIAL_PARCELS).toEqual({
      bookCount: 132,
      parcelCount: 1032,
    });
    expect(summary.grandTotal).toEqual({
      bookCount: 132,
      parcelCount: 1032,
    });
    expect(summary.byDate[0]).toMatchObject({
      totalBooks: 132,
      totalParcels: 1032,
      values: {
        SPATIAL_PARCELS: { bookCount: 132, parcelCount: 1032 },
      },
    });
    expect(summary.byCommune[0]).toMatchObject({
      bookCount: 132,
      parcelCount: 1032,
      byField: {
        SPATIAL_PARCELS: { bookCount: 132, parcelCount: 1032 },
      },
    });
    expect(prisma.syncLog.findFirst).toHaveBeenCalledWith({
      where: { source: { in: ['SHEET_SYNC', 'CSV_UPLOAD'] } },
      orderBy: { syncedAt: 'desc' },
    });

    const filteredSummary = await service.getSummary({
      fieldCode: 'SPATIAL_PARCELS',
    });
    expect(filteredSummary.grandTotal).toEqual({
      bookCount: 132,
      parcelCount: 1032,
    });
  });

  it('encodes Vietnamese UTF-8 branch query parameter when calling external report API', async () => {
    const prisma = createMockPrisma();
    const service = createDashboardService(prisma);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        generated_at: '2026-10-23 11:34:39',
        files: {
          total: 103225,
          da_chuan: 45405,
          chua_chuan: 57434,
          bo_qua: 386,
        },
        folders: { total: 33050, da_chuan: 2810, chua_chuan: 30240, bo_qua: 0 },
        boxes: { total: 147 },
        gcn_total: 69416,
        branches: ['VPĐKĐĐ KV Hà Quảng', 'VPĐKĐĐ KV Nguyên Bình'],
        branch: 'VPĐKĐĐ KV Hà Quảng',
      }),
    } as Response);

    const report = await service.getExternalReport('VPĐKĐĐ KV Hà Quảng');
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringContaining(
        `branch=${encodeURIComponent('VPĐKĐĐ KV Hà Quảng')}`,
      ),
      expect.any(Object),
    );
    expect(report.gcn_total).toBe(69416);
    expect(report.available).toBe(true);
    fetchSpy.mockRestore();
  });

  it('returns safe fallback when external report API fails', async () => {
    const prisma = createMockPrisma();
    const service = createDashboardService(prisma);
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockRejectedValue(new Error('Network timeout'));

    const report = await service.getExternalReport();
    expect(report.available).toBe(false);
    expect(report.files.total).toBe(0);
    fetchSpy.mockRestore();
  });

  it('fetches and parses Google Sheet modules (PC06, 2-tier conversion, VNLIS)', async () => {
    const prisma = createMockPrisma();
    const service = createDashboardService(prisma);
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('1SOaLTftRmFtYw937R6NIIHewdDEFJG3sSUf0azaSkNI')) {
          return {
            ok: true,
            text: async () =>
              'STT,Tên xã,Số thửa\n1,Trà Lĩnh,86\n2,Vinh Quý,6535',
          } as Response;
        }
        if (url.includes('gid=1037546126')) {
          return {
            ok: true,
            text: async () =>
              'STT,Tên xã,Trích xuất từ iLIS,Ký số XML,Đẩy VNLIS,Kết quả VNLIS tăng thêm\n1,Trà Lĩnh,10.000,10.000,10.000,10.000\nTổng cộng,,10.000,10.000,10.000,10.000',
          } as Response;
        }
        return {
          ok: true,
          text: async () =>
            'STT,Tên xã,Gửi PC06/xã,Nhận đã đối khớp,Đẩy thông tin chủ,Đẩy thông tin dân cư (theo thửa),"Đã đối khớp thành công, toàn tỉnh","Chưa khớp, chưa đủ điều kiện, toàn tỉnh",Tổng thửa,Tỉ lệ đối khớp thành công (%),"Tỉ lệ chưa khớp, chưa đủ ĐK (%)"\n1,Trà Lĩnh,1.000,800,800,16.000,1.307.905,551.081,1.858.986,"70,36%","29,64%"\nTổng cộng,,1.000,800,800,16.000,1.307.905,551.081,1.858.986,"70,36%","29,64%"',
        } as Response;
      });

    try {
      const modules = await service.getSheetModules();
      expect(modules.twoTierConversion.totalParcels).toBe(6621);
      expect(modules.twoTierConversion.rows).toHaveLength(2);
      expect(modules.vnlisSync.totals.extractedIlis).toBe(10000);
      expect(modules.populationMatch.totals.totalParcels).toBe(1858986);
      expect(modules.populationMatch.totals.matchedProvinceWide).toBe(1307905);
      expect(modules.populationMatch.rows).toHaveLength(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('syncs custom twoTierSheetUrl and vnlisSheetUrl (both sheets) and persists state', async () => {
    const prisma = createMockPrisma();
    prisma.syncLog.upsert = jest.fn().mockResolvedValue({});
    prisma.landStatRecord.upsert = jest.fn().mockResolvedValue({});
    const lockRunner = jest.fn(async (work) =>
      work({ token: 1n, isActive: () => true }),
    );
    const service = createDashboardService(prisma, {
      withSheetSyncLock: lockRunner,
      assertCurrentSheetSyncLease: jest.fn().mockResolvedValue(undefined),
    } as unknown as SheetSyncLockService);
    const fetchSpy = jest
      .spyOn(global, 'fetch')
      .mockImplementation(async (input) => {
        const url = String(input);
        if (url.includes('1SOaLTftRmFtYw937R6NIIHewdDEFJG3sSUf0azaSkNI')) {
          return {
            ok: true,
            text: async () => 'STT,Tên xã,Số thửa\n1,Trà Lĩnh,86',
          } as Response;
        }
        if (url.includes('gid=1037546126')) {
          return {
            ok: true,
            text: async () =>
              'STT,Tên xã,Trích xuất từ iLIS,Ký số XML,Đẩy VNLIS,Kết quả VNLIS tăng thêm\n1,Trà Lĩnh,10.000,10.000,10.000,10.000',
          } as Response;
        }
        if (url.includes('gid=2082395834')) {
          return {
            ok: true,
            text: async () =>
              'STT,Tên xã,Gửi PC06/xã,Nhận đã đối khớp,Đẩy thông tin chủ,Đẩy thông tin dân cư (theo thửa),"Đã đối khớp thành công, toàn tỉnh","Chưa khớp, chưa đủ điều kiện, toàn tỉnh",Tổng thửa,Tỉ lệ đối khớp thành công (%),"Tỉ lệ chưa khớp, chưa đủ ĐK (%)"\n1,Trà Lĩnh,1.000,800,800,16.000,1.307.905,551.081,1.858.986,"70,36%","29,64%"',
          } as Response;
        }
        return {
          ok: true,
          text: async () =>
            '1,GCN Ngoài Danh Sách,18/10/2026,Độc Lập,,132,1032',
        } as Response;
      });

    try {
      await service.syncFromGoogleSheet({
        sheetUrl:
          'https://docs.google.com/spreadsheets/d/16WlVI8xzoxudlmCW7hiMsnynFEr1dNhXuPUBW4XmvzY/edit?gid=982199452',
        twoTierSheetUrl:
          'https://docs.google.com/spreadsheets/d/1SOaLTftRmFtYw937R6NIIHewdDEFJG3sSUf0azaSkNI/edit?gid=0#gid=0',
        vnlisSheetUrl:
          'https://docs.google.com/spreadsheets/d/1GYM2mqpc8vWB9EAgxcCSzuLFqKbRhOYB/edit?gid=1037546126#gid=1037546126',
        replaceExisting: false,
      });

      expect(prisma.syncLog.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'SHEET_MODULES_STATE' },
        }),
      );
      expect(lockRunner).toHaveBeenCalledTimes(1);
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('rejects main and module sync requests while another Sheet sync owns the lock', async () => {
    const prisma = createMockPrisma();
    const lockRunner = jest.fn().mockResolvedValue(null);
    const service = createDashboardService(prisma, {
      withSheetSyncLock: lockRunner,
      assertCurrentSheetSyncLease: jest.fn(),
    } as unknown as SheetSyncLockService);
    const fetchSpy = jest.spyOn(global, 'fetch');

    try {
      await expect(service.syncFromGoogleSheet({})).rejects.toThrow(
        'Đang có lượt đồng bộ Google Sheet khác',
      );
      await expect(service.syncSheetModules()).rejects.toThrow(
        'Đang có lượt đồng bộ Google Sheet khác',
      );
      await expect(service.getSheetModules()).rejects.toThrow(
        'Đang có lượt đồng bộ Google Sheet khác',
      );
      expect(lockRunner).toHaveBeenCalledTimes(3);
      expect(fetchSpy).not.toHaveBeenCalled();
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('scheduled Sheet sync overwrites matching manual data and removes stale manual and CSV rows', async () => {
    const prisma = createMockPrisma();
    const date = new Date('2026-10-18T00:00:00.000Z');
    const records = [
      {
        id: 'manual-match', reportDate: date, fieldCode: 'OWNER_MISMATCH', commune: 'Độc Lập',
        bookCount: 7, parcelCount: 70, source: 'MANUAL', extraData: null, note: 'Keep note',
      },
      {
        id: 'csv-stale', reportDate: date, fieldCode: 'OUT_OF_LIST_GCN', commune: 'Xã cũ',
        bookCount: 4, parcelCount: 40, source: 'CSV_UPLOAD', extraData: null, note: null,
      },
      {
        id: 'manual-stale', reportDate: date, fieldCode: 'STANDARDIZED_MAP_SHEETS', commune: 'Xã cũ',
        bookCount: 5, parcelCount: 50, source: 'MANUAL', extraData: null, note: null,
      },
      {
        id: 'sheet-history', reportDate: new Date('2026-10-17T00:00:00.000Z'),
        fieldCode: 'OUT_OF_LIST_GCN', commune: 'Xã cũ', bookCount: 3, parcelCount: 30,
        source: 'SHEET_SYNC', extraData: null, note: null,
      },
      {
        id: 'spatial', reportDate: date, fieldCode: 'SPATIAL_PARCELS', commune: 'Độc Lập',
        bookCount: 2, parcelCount: 20, source: 'SHEET_SYNC', extraData: null, note: null,
      },
    ];
    (prisma.landStatRecord.findMany as jest.Mock).mockImplementation(
      ({ where }: { where?: { source?: { in?: string[] }; fieldCode?: { not?: string } } }) =>
        where?.source?.in
          ? records.filter((record) =>
              where.source!.in!.includes(record.source) &&
              (!where.fieldCode?.not || record.fieldCode !== where.fieldCode.not),
            )
          : records,
    );
    (prisma.landStatRecord.upsert as jest.Mock).mockImplementation(
      async ({ update }: { update: { bookCount: number; parcelCount: number; source: string } }) => {
        Object.assign(records[0], update);
        return records[0];
      },
    );
    (prisma.landStatRecord.deleteMany as jest.Mock).mockImplementation(
      async ({ where }: {
        where: {
          source?: { in?: string[] };
          fieldCode?: { not?: string };
          id?: { in?: string[] };
        };
      }) => {
        const before = records.length;
        for (let index = records.length - 1; index >= 0; index -= 1) {
          const record = records[index];
          const matchesSource = where.source?.in?.includes(record.source);
          const matchesField = !where.fieldCode?.not || record.fieldCode !== where.fieldCode.not;
          const matchesId = where.id?.in?.includes(record.id);
          if ((matchesSource && matchesField) || matchesId) records.splice(index, 1);
        }
        return { count: before - records.length };
      },
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '1,Sai Lệch Thông Tin,18/10/2026,Độc Lập,,12,120',
    } as Response);

    try {
      const result = await createDashboardService(prisma).syncMainSheet({}, 'SCHEDULED', { token: 1n, isActive: () => true });

      expect(result.status).toBe('SUCCESS');
      expect(prisma.landStatRecord.deleteMany).toHaveBeenCalledWith({
        where: {
          source: { in: ['MANUAL', 'CSV_UPLOAD'] },
          fieldCode: { not: 'SPATIAL_PARCELS' },
        },
      });
      expect(records).toContainEqual(expect.objectContaining({
        id: 'manual-match', source: 'SHEET_SYNC', bookCount: 12, parcelCount: 120,
        note: 'Keep note',
      }));
      expect(records.map(({ id }) => id)).not.toContain('csv-stale');
      expect(records.map(({ id }) => id)).not.toContain('manual-stale');
      expect(records.map(({ id }) => id)).toContain('sheet-history');
      expect(records.map(({ id }) => id)).toContain('spatial');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('keeps data when the scheduled main Sheet is unavailable or invalid', async () => {
    const prisma = createMockPrisma();
    const fetchSpy = jest.spyOn(global, 'fetch');
    const service = createDashboardService(prisma);
    const responses = [
      { ok: false, status: 500, text: async () => '' },
      { ok: true, status: 200, text: async () => '' },
      { ok: true, status: 200, text: async () => 'unrecognized data' },
    ] as Response[];

    try {
      for (const response of responses) {
        fetchSpy.mockResolvedValueOnce(response);
        await expect(
          service.syncMainSheet({}, 'SCHEDULED', { token: 1n, isActive: () => true }),
        ).rejects.toThrow();
      }
      fetchSpy.mockRejectedValueOnce(
        Object.assign(new Error('request timed out'), { name: 'TimeoutError' }),
      );
      await expect(
        service.syncMainSheet({}, 'SCHEDULED', { token: 1n, isActive: () => true }),
      ).rejects.toThrow();

      expect(prisma.landStatRecord.upsert).not.toHaveBeenCalled();
      expect(prisma.landStatRecord.deleteMany).not.toHaveBeenCalled();
      expect(prisma.syncLog.create).toHaveBeenCalledTimes(4);
      expect(prisma.syncLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'FAILED', recordsSynced: 0 }),
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('logs a failed main Sheet sync when the write transaction rolls back', async () => {
    const prisma = createMockPrisma();
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(
      new Error('database write failed'),
    );
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '1,Sai Lệch Thông Tin,18/10/2026,Độc Lập,,12,120',
    } as Response);

    try {
      await expect(
        createDashboardService(prisma).syncMainSheet({}, 'SCHEDULED', { token: 1n, isActive: () => true }),
      ).rejects.toThrow('database write failed');
      expect(prisma.syncLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'FAILED', recordsSynced: 0 }),
      });
      expect(prisma.syncLog.create).not.toHaveBeenCalledWith({
        data: expect.objectContaining({ status: 'SUCCESS' }),
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('redacts credentials from the main Sheet URL stored in sync logs', async () => {
    const prisma = createMockPrisma();
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      text: async () => '1,Sai Lệch Thông Tin,18/10/2026,Độc Lập,,12,120',
    } as Response);

    try {
      await createDashboardService(prisma).syncMainSheet(
        { sheetUrl: 'https://reports.example/sheet.csv?access_token=private-token' },
        'SCHEDULED',
        { token: 1n, isActive: () => true },
      );

      const successLog = (prisma.syncLog.create as jest.Mock).mock.calls
        .map(([args]) => args.data)
        .find(({ status }: { status: string }) => status === 'SUCCESS');
      expect(successLog.sheetUrl).not.toContain('private-token');
      expect(successLog.sheetUrl).toContain('REDACTED');
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it.each(['main', 'modules'] as const)(
    'continues the daily run when the %s group fails and logs a failed total',
    async (failedGroup) => {
      const prisma = createMockPrisma();
      const lockRunner = jest.fn(async (work) =>
        work({ token: 1n, isActive: () => true }),
      );
      const service = createDashboardService(prisma, {
        withSheetSyncLock: lockRunner,
        assertCurrentSheetSyncLease: jest.fn(),
      } as unknown as SheetSyncLockService);
      const mainSync = jest.spyOn(service, 'syncMainSheet');
      const modulesResult = {
        twoTierConversion: { rows: [{}, {}] },
        vnlisSync: { rows: [{}] },
        populationMatch: { rows: [{}] },
      };
      const moduleSync = jest.fn().mockImplementation(
        failedGroup === 'modules'
          ? async () => { throw new Error('module sync failed'); }
          : async () => modulesResult,
      );
      Object.defineProperty(service, 'syncSheetModulesLocked', { value: moduleSync });
      if (failedGroup === 'main') mainSync.mockRejectedValueOnce(new Error('main sync failed'));
      else mainSync.mockResolvedValueOnce({ recordsSynced: 2, status: 'SUCCESS' } as never);

      const result = await service.runDailySheetSync();

      expect(result).toMatchObject({
        status: 'FAILED',
        main: { status: failedGroup === 'main' ? 'FAILED' : 'SUCCESS' },
        modules: { status: failedGroup === 'modules' ? 'FAILED' : 'SUCCESS' },
      });
      expect(mainSync).toHaveBeenCalledTimes(1);
      expect(moduleSync).toHaveBeenCalledTimes(1);
      expect(lockRunner).toHaveBeenCalledTimes(1);
      expect(prisma.syncLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'SHEET_DAILY', status: 'FAILED' }),
      });
    },
  );

  it('skips module fetches when the lock connection was lost after the main group', async () => {
    const prisma = createMockPrisma();
    const lease = { token: 1n, isActive: jest.fn().mockReturnValue(false) };
    const lockRunner = jest.fn(async (work) => work(lease));
    const service = createDashboardService(prisma, {
      withSheetSyncLock: lockRunner,
      assertCurrentSheetSyncLease: jest.fn(),
    } as unknown as SheetSyncLockService);
    jest.spyOn(service, 'syncMainSheet').mockResolvedValue({
      recordsSynced: 2,
      status: 'SUCCESS',
    } as never);
    const moduleSync = jest.fn();
    Object.defineProperty(service, 'syncSheetModulesLocked', { value: moduleSync });

    const result = await service.runDailySheetSync();

    expect(result).toMatchObject({
      status: 'FAILED',
      main: { status: 'SUCCESS' },
      modules: { status: 'FAILED' },
    });
    expect(moduleSync).not.toHaveBeenCalled();
  });

  it('marks the daily run successful only when both groups succeed', async () => {
    const prisma = createMockPrisma();
    const service = createDashboardService(prisma);
    jest.spyOn(service, 'syncMainSheet').mockResolvedValue({
      recordsSynced: 2,
      status: 'SUCCESS',
    } as never);
    Object.defineProperty(service, 'syncSheetModulesLocked', {
      value: jest.fn().mockResolvedValue({
        twoTierConversion: { rows: [{}] },
        vnlisSync: { rows: [{}] },
        populationMatch: { rows: [{}] },
      }),
    });

    const result = await service.runDailySheetSync();

    expect(result).toMatchObject({
      status: 'SUCCESS',
      main: { recordsSynced: 2, status: 'SUCCESS' },
      modules: { recordsSynced: 3, status: 'SUCCESS' },
    });
    expect(prisma.syncLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        source: 'SHEET_DAILY',
        recordsSynced: 5,
        status: 'SUCCESS',
      }),
    });
  });

  it('does not write a daily summary when another instance holds the lock', async () => {
    const prisma = createMockPrisma();
    const lockRunner = jest.fn().mockResolvedValue(null);
    const service = createDashboardService(prisma, {
      withSheetSyncLock: lockRunner,
      assertCurrentSheetSyncLease: jest.fn(),
    } as unknown as SheetSyncLockService);

    await expect(service.runDailySheetSync()).resolves.toBeNull();

    expect(lockRunner).toHaveBeenCalledTimes(1);
    expect(prisma.syncLog.create).not.toHaveBeenCalled();
  });

  it('keeps the previous module cache when any linked Sheet is invalid or unavailable', async () => {
    const prisma = createMockPrisma();
    const previous = {
      twoTierConversion: { rows: [{ stt: 1, commune: 'Trà Lĩnh', parcelCount: 86 }], totalParcels: 86 },
      vnlisSync: { rows: [], totals: { extractedIlis: 0, signedXml: 0, pushedVnlis: 0, vnlisAddedResult: 0 } },
      populationMatch: { rows: [], totals: { sentPc06: 0, receivedMatched: 0, pushedOwnerInfo: 0, pushedPopulationParcels: 0, matchedProvinceWide: 1, unmatchedProvinceWide: 0, totalParcels: 1, matchedRate: '100%', unmatchedRate: '0%' } },
      syncedAt: '2026-10-29T00:00:00.000Z',
    };
    (prisma.syncLog.findUnique as jest.Mock).mockImplementation(
      ({ where }: { where: { id: string } }) =>
        where.id === 'SHEET_MODULES_STATE'
          ? { id: 'SHEET_MODULES_STATE', message: JSON.stringify(previous) }
          : null,
    );
    prisma.syncLog.upsert = jest.fn();
    prisma.syncLog.create = jest.fn().mockResolvedValue({});
    const fetchSpy = jest.spyOn(global, 'fetch');
    const sources = [
      ['two-tier', '1SOaLTftRmFtYw937R6NIIHewdDEFJG3sSUf0azaSkNI'],
      ['vnlis', 'gid=1037546126'],
      ['population', 'gid=2082395834'],
    ] as const;
    const validCsv = {
      twoTier: 'STT,Tên xã,Số thửa\n1,Trà Lĩnh,86',
      vnlis: 'STT,Tên xã,Trích xuất từ iLIS,Ký số XML,Đẩy VNLIS,Kết quả VNLIS tăng thêm\n1,Trà Lĩnh,10,10,10,10',
      population: 'STT,Tên xã,Gửi PC06/xã,Nhận đã đối khớp,Đẩy thông tin chủ,Đẩy thông tin dân cư (theo thửa),\"Đã đối khớp thành công, toàn tỉnh\",\"Chưa khớp, chưa đủ điều kiện, toàn tỉnh\",Tổng thửa,Tỉ lệ đối khớp thành công (%),\"Tỉ lệ chưa khớp, chưa đủ ĐK (%)\"\n1,Trà Lĩnh,1,1,1,1,1,1,2,50%,50%',
    };
    const failures = [
      ['HTTP 500', 'http'],
      ['empty response', 'empty'],
      ['HTML login page', 'html'],
      ['malformed CSV', 'malformed'],
      ['timeout', 'timeout'],
    ] as const;

    try {
      const service = createDashboardService(prisma);
      for (const [sourceName, sourceUrl] of sources) {
        for (const [failureName, failureMode] of failures) {
          fetchSpy.mockImplementation(async (input) => {
            const url = String(input);
            const isFailureSource = url.includes(sourceUrl);
            if (isFailureSource) {
              if (failureMode === 'timeout') throw new Error('request timed out');
              const text = failureMode === 'empty'
                ? ''
                : failureMode === 'html'
                  ? '<html><title>Login</title></html>'
                  : failureMode === 'malformed'
                    ? 'malformed'
                    : '';
              return {
                ok: failureMode !== 'http',
                status: failureMode === 'http' ? 500 : 200,
                text: async () => text,
              } as Response;
            }
            const body = url.includes(sources[0][1])
              ? validCsv.twoTier
              : url.includes(sources[1][1])
                ? validCsv.vnlis
                : validCsv.population;
            return { ok: true, text: async () => body } as Response;
          });

          try {
            await expect(service.syncSheetModules()).rejects.toThrow(
              'Không thể đồng bộ đầy đủ các Google Sheet phụ',
            );
            expect(prisma.syncLog.upsert).not.toHaveBeenCalled();
            expect(await service.getSheetModules()).toMatchObject(previous);
          } catch (error) {
            throw new Error(`${sourceName} ${failureName}: ${String(error)}`);
          }
        }
      }
    } finally {
      fetchSpy.mockRestore();
    }
  });

  it('preserves the module cache when its database transaction fails', async () => {
    const prisma = createMockPrisma();
    const previous = {
      twoTierConversion: { rows: [{ stt: 1, commune: 'Trà Lĩnh', parcelCount: 86 }], totalParcels: 86 },
      vnlisSync: { rows: [], totals: { extractedIlis: 0, signedXml: 0, pushedVnlis: 0, vnlisAddedResult: 0 } },
      populationMatch: { rows: [], totals: { sentPc06: 0, receivedMatched: 0, pushedOwnerInfo: 0, pushedPopulationParcels: 0, matchedProvinceWide: 1, unmatchedProvinceWide: 0, totalParcels: 1, matchedRate: '100%', unmatchedRate: '0%' } },
      syncedAt: '2026-10-29T00:00:00.000Z',
    };
    (prisma.syncLog.findUnique as jest.Mock).mockResolvedValue({
      id: 'SHEET_MODULES_STATE', message: JSON.stringify(previous),
    });
    prisma.syncLog.upsert = jest.fn();
    prisma.syncLog.create = jest.fn().mockResolvedValue({});
    (prisma.$transaction as jest.Mock).mockRejectedValueOnce(new Error('database write failed'));
    const fetchSpy = jest.spyOn(global, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('1SOaLTftRmFtYw937R6NIIHewdDEFJG3sSUf0azaSkNI')) {
        return { ok: true, text: async () => 'STT,Tên xã,Số thửa\n1,Trà Lĩnh,86' } as Response;
      }
      if (url.includes('gid=1037546126')) {
        return { ok: true, text: async () => 'STT,Tên xã,Trích xuất từ iLIS,Ký số XML,Đẩy VNLIS,Kết quả VNLIS tăng thêm\n1,Trà Lĩnh,10,10,10,10' } as Response;
      }
      return {
        ok: true,
        text: async () => 'STT,Tên xã,Gửi PC06/xã,Nhận đã đối khớp,Đẩy thông tin chủ,Đẩy thông tin dân cư (theo thửa),\"Đã đối khớp thành công, toàn tỉnh\",\"Chưa khớp, chưa đủ điều kiện, toàn tỉnh\",Tổng thửa,Tỉ lệ đối khớp thành công (%),\"Tỉ lệ chưa khớp, chưa đủ ĐK (%)\"\n1,Trà Lĩnh,1,1,1,1,1,1,2,50%,50%',
      } as Response;
    });

    try {
      const service = createDashboardService(prisma);
      await expect(service.syncSheetModules()).rejects.toThrow(
        'Không thể đồng bộ đầy đủ các Google Sheet phụ',
      );
      expect(prisma.syncLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({ source: 'SHEET_MODULES', status: 'FAILED' }),
      });
      expect(await service.getSheetModules()).toMatchObject(previous);
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
