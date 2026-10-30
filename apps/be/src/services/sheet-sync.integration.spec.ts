import { PrismaService } from "../prisma/prisma.service";
import { LandDashboardService } from "./land-dashboard.service";
import type { SheetSyncLockService } from "./sheet-sync-lock.service";

const databaseSchema = process.env.DATABASE_URL
  ? new URL(process.env.DATABASE_URL).searchParams.get("schema")
  : null;
const enabled = Boolean(
  databaseSchema?.startsWith("codex_sheet_sync_test_") &&
  process.env.SHEET_SYNC_LOCK_DATABASE_URL &&
  new URL(process.env.SHEET_SYNC_LOCK_DATABASE_URL).searchParams.get(
    "schema",
  ) === databaseSchema,
);

describe("LandDashboardService PostgreSQL integration", () => {
  let prisma: PrismaService;
  let service: LandDashboardService;

  beforeAll(async () => {
    if (!enabled) return;
    prisma = new PrismaService();
    await prisma.fieldDefinition.createMany({
      data: [
        {
          code: "OWNER_MISMATCH",
          label: "Sai Lệch Thông Tin CSH",
          sheetAlias: "SAI LỆCH THÔNG TIN",
          unit: "sổ / thửa",
          isDefault: true,
          sortOrder: 1,
        },
        {
          code: "OUT_OF_LIST_GCN",
          label: "GCN Ngoài Danh Sách",
          sheetAlias: "NGOÀI DANH SÁCH",
          unit: "sổ / thửa",
          isDefault: true,
          sortOrder: 2,
        },
      ],
    });
    service = new LandDashboardService(prisma, {
      withSheetSyncLock: async (work) =>
        work({ token: 1n, isActive: () => true }),
      assertCurrentSheetSyncLease: jest.fn().mockResolvedValue(undefined),
    } as unknown as SheetSyncLockService);
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  (enabled ? it : it.skip)(
    "updates matching rows, deletes stale manual/CSV rows, preserves history and is idempotent",
    async () => {
      const date = new Date("2026-10-18T00:00:00.000Z");
      await prisma.landStatRecord.createMany({
        data: [
          {
            id: "manual-match",
            reportDate: date,
            fieldCode: "OWNER_MISMATCH",
            commune: "Độc Lập",
            bookCount: 7,
            parcelCount: 70,
            source: "MANUAL",
            note: "Keep note",
          },
          {
            id: "csv-match",
            reportDate: date,
            fieldCode: "OUT_OF_LIST_GCN",
            commune: "Quảng Uyên",
            bookCount: 8,
            parcelCount: 80,
            source: "CSV_UPLOAD",
          },
          {
            id: "manual-stale",
            reportDate: date,
            fieldCode: "OWNER_MISMATCH",
            commune: "Xã cũ",
            bookCount: 5,
            parcelCount: 50,
            source: "MANUAL",
          },
          {
            id: "csv-stale",
            reportDate: date,
            fieldCode: "OUT_OF_LIST_GCN",
            commune: "Xã cũ",
            bookCount: 4,
            parcelCount: 40,
            source: "CSV_UPLOAD",
          },
          {
            id: "sheet-history",
            reportDate: new Date("2026-10-17T00:00:00.000Z"),
            fieldCode: "OUT_OF_LIST_GCN",
            commune: "Xã cũ",
            bookCount: 3,
            parcelCount: 30,
            source: "SHEET_SYNC",
          },
          {
            id: "spatial",
            reportDate: date,
            fieldCode: "SPATIAL_PARCELS",
            commune: "Độc Lập",
            bookCount: 2,
            parcelCount: 20,
            source: "MANUAL",
          },
        ],
      });
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        text: async () =>
          "1,Sai Lệch Thông Tin,18/10/2026,Độc Lập,,12,120\n" +
          "2,GCN Ngoài Danh Sách,18/10/2026,Quảng Uyên,,14,140",
      } as Response);

      try {
        await service.syncMainSheet(
          {
            sheetUrl:
              "https://docs.google.com/spreadsheets/d/test-sheet-id/edit?gid=1",
          },
          "SCHEDULED",
          { token: 1n, isActive: () => true },
        );
        const result = await service.syncMainSheet(
          {
            sheetUrl:
              "https://docs.google.com/spreadsheets/d/test-sheet-id/edit?gid=1",
          },
          "SCHEDULED",
          { token: 1n, isActive: () => true },
        );

        const records = await prisma.landStatRecord.findMany({
          where: { reportDate: date },
          orderBy: { id: "asc" },
        });
        expect(result.status).toBe("SUCCESS");
        expect(records).toHaveLength(3);
        expect(records).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: "manual-match",
              source: "SHEET_SYNC",
              bookCount: 12,
              parcelCount: 120,
              note: "Keep note",
            }),
            expect.objectContaining({
              id: "csv-match",
              source: "SHEET_SYNC",
              bookCount: 14,
              parcelCount: 140,
            }),
            expect.objectContaining({ id: "spatial", source: "MANUAL" }),
          ]),
        );
        expect(
          await prisma.landStatRecord.findUnique({
            where: { id: "sheet-history" },
          }),
        ).not.toBeNull();
        expect(
          await prisma.landStatRecord.findUnique({
            where: { id: "manual-stale" },
          }),
        ).toBeNull();
        expect(
          await prisma.landStatRecord.findUnique({
            where: { id: "csv-stale" },
          }),
        ).toBeNull();
        expect(
          await prisma.syncLog.count({
            where: {
              source: "SHEET_SYNC",
              status: "SUCCESS",
              recordsSynced: 2,
            },
          }),
        ).toBe(2);
        expect(fetchSpy).toHaveBeenCalledTimes(2);
      } finally {
        fetchSpy.mockRestore();
      }
    },
    30_000,
  );
});
