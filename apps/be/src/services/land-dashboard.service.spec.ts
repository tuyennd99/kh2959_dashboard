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
  ];

  function createMockPrisma() {
    return {
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
      },
      syncLog: {
        findFirst: jest.fn().mockResolvedValue(null),
      },
    } as unknown as PrismaService;
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

  it('encodes Vietnamese UTF-8 branch query parameter when calling external report API', async () => {
    const prisma = createMockPrisma();
    const service = new LandDashboardService(prisma);
    const fetchSpy = jest.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        generated_at: '2026-10-23 11:34:39',
        files: { total: 103225, da_chuan: 45405, chua_chuan: 57434, bo_qua: 386 },
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
});
