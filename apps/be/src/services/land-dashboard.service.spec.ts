import { LandDashboardService } from './land-dashboard.service';
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
      },
      syncLog: {
        findFirst: jest.fn().mockResolvedValue(null),
        findUnique: jest.fn().mockResolvedValue(null),
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

  it('computes totalsByField, grandTotal, byDate, and byCommune accurately', async () => {
    const prisma = createMockPrisma();
    const service = new LandDashboardService(prisma);
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
    await new LandDashboardService(prisma).onModuleInit();
    // Later GCN records must not become new spatial records on restart.
    (prisma.landStatRecord.findMany as jest.Mock).mockResolvedValue([
      { ...sourceRecord, commune: 'Quảng Uyên', parcelCount: 2000 },
    ]);
    await new LandDashboardService(prisma).onModuleInit();

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
    await new LandDashboardService(prisma).onModuleInit();
    await new LandDashboardService(prisma).onModuleInit();

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
      new LandDashboardService(prisma).onModuleInit(),
    ).rejects.toThrow('Copy failed');
    expect(prisma.syncLog.create).not.toHaveBeenCalled();

    await new LandDashboardService(prisma).onModuleInit();
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

      const service = new LandDashboardService(prisma);
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
      await new LandDashboardService(prisma).syncFromGoogleSheet({
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

    const service = new LandDashboardService(prisma);
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
    const service = new LandDashboardService(prisma);
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
    const service = new LandDashboardService(prisma);
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
    const service = new LandDashboardService(prisma);
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
    const service = new LandDashboardService(prisma);
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
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
