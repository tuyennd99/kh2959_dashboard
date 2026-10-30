import { PrismaService } from "../prisma/prisma.service";
import { LandDashboardService } from "./land-dashboard.service";
import { SheetSyncLockService } from "./sheet-sync-lock.service";

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
const previousUrls = {
  main: process.env.GOOGLE_SHEET_CSV_URL,
  twoTier: process.env.TWO_TIER_SHEET_CSV_URL,
  vnlis: process.env.VNLIS_SHEET_CSV_URL,
  population: process.env.POPULATION_SHEET_CSV_URL,
};
const testUrls = {
  main: "https://docs.google.com/spreadsheets/d/main-sheet/edit?gid=1",
  twoTier: "https://docs.google.com/spreadsheets/d/two-tier/edit?gid=2",
  vnlis: "https://docs.google.com/spreadsheets/d/modules/edit?gid=3",
  population: "https://docs.google.com/spreadsheets/d/modules/edit?gid=4",
};

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
        {
          code: "SPATIAL_PARCELS",
          label: "Số thửa không gian",
          sheetAlias: null,
          unit: "thửa",
          isDefault: true,
          sortOrder: 4,
        },
      ],
    });
    service = new LandDashboardService(
      prisma,
      new SheetSyncLockService(prisma),
    );
  });

  beforeEach(async () => {
    if (!enabled) return;
    process.env.GOOGLE_SHEET_CSV_URL = testUrls.main;
    process.env.TWO_TIER_SHEET_CSV_URL = testUrls.twoTier;
    process.env.VNLIS_SHEET_CSV_URL = testUrls.vnlis;
    process.env.POPULATION_SHEET_CSV_URL = testUrls.population;
    await prisma.landStatRecord.deleteMany();
    await prisma.syncLog.deleteMany();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
    if (previousUrls.main === undefined) delete process.env.GOOGLE_SHEET_CSV_URL;
    else process.env.GOOGLE_SHEET_CSV_URL = previousUrls.main;
    if (previousUrls.twoTier === undefined) delete process.env.TWO_TIER_SHEET_CSV_URL;
    else process.env.TWO_TIER_SHEET_CSV_URL = previousUrls.twoTier;
    if (previousUrls.vnlis === undefined) delete process.env.VNLIS_SHEET_CSV_URL;
    else process.env.VNLIS_SHEET_CSV_URL = previousUrls.vnlis;
    if (previousUrls.population === undefined) delete process.env.POPULATION_SHEET_CSV_URL;
    else process.env.POPULATION_SHEET_CSV_URL = previousUrls.population;
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
      const csvByGid: Record<string, string> = {
        "1":
          "1,Sai Lệch Thông Tin,18/10/2026,Độc Lập,,12,120\n" +
          "2,GCN Ngoài Danh Sách,18/10/2026,Quảng Uyên,,14,140",
        "2": "STT,Tên xã,Số thửa\n1,Trà Lĩnh,86",
        "3":
          "STT,Tên xã,Trích xuất từ iLIS,Ký số XML,Đẩy VNLIS,Kết quả VNLIS tăng thêm\n" +
          "1,Trà Lĩnh,10,9,8,7",
        "4":
          "STT,Tên xã,Gửi PC06/xã,Nhận đã đối khớp,Đẩy thông tin chủ,Đẩy thông tin dân cư (theo thửa)," +
          '"Đã đối khớp thành công, toàn tỉnh","Chưa khớp, chưa đủ điều kiện, toàn tỉnh",Tổng thửa,' +
          '"Tỉ lệ đối khớp thành công (%)","Tỉ lệ chưa khớp, chưa đủ ĐK (%)"\n' +
          "1,Trà Lĩnh,1,1,1,1,1,1,2,50%,50%",
      };
      const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
        const gid = new URL(String(input)).searchParams.get("gid") ?? "";
        return { ok: true, text: async () => csvByGid[gid] } as Response;
      });

      try {
        await service.runDailySheetSync();
        const result = await service.runDailySheetSync();

        const records = await prisma.landStatRecord.findMany({
          where: { reportDate: date },
          orderBy: { id: "asc" },
        });
        expect(result?.status).toBe("SUCCESS");
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
        expect(
          await prisma.syncLog.count({
            where: {
              source: "SHEET_MODULES",
              status: "SUCCESS",
              id: { not: "SHEET_MODULES_STATE" },
            },
          }),
        ).toBe(2);
        expect(
          await prisma.syncLog.count({
            where: { source: "SHEET_DAILY", status: "SUCCESS" },
          }),
        ).toBe(2);
        const cache = await prisma.syncLog.findUnique({
          where: { id: "SHEET_MODULES_STATE" },
        });
        expect(JSON.parse(cache!.message!)).toMatchObject({
          twoTierConversion: { rows: [expect.objectContaining({ commune: "Trà Lĩnh" })] },
          vnlisSync: { rows: [expect.objectContaining({ commune: "Trà Lĩnh" })] },
          populationMatch: { rows: [expect.objectContaining({ commune: "Trà Lĩnh" })] },
        });
        expect(fetchSpy).toHaveBeenCalledTimes(8);
      } finally {
        fetchSpy.mockRestore();
      }
    },
    30_000,
  );

  (enabled ? it : it.skip)(
    "blocks daily, manual and refresh writes while a second instance owns the lock",
    async () => {
      const lockOwner = new SheetSyncLockService(prisma);
      let enterOwner!: () => void;
      let releaseOwner!: () => void;
      const entered = new Promise<void>((resolve) => {
        enterOwner = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseOwner = resolve;
      });
      const held = lockOwner.withSheetSyncLock(async () => {
        enterOwner();
        await release;
      });
      await entered;
      const fetchSpy = jest.spyOn(global, "fetch");

      try {
        await expect(service.runDailySheetSync()).resolves.toBeNull();
        await expect(service.syncFromGoogleSheet({})).rejects.toThrow(
          "Đang có lượt đồng bộ Google Sheet khác",
        );
        await expect(service.syncSheetModules()).rejects.toThrow(
          "Đang có lượt đồng bộ Google Sheet khác",
        );
        expect(fetchSpy).not.toHaveBeenCalled();
      } finally {
        releaseOwner();
        await held;
        fetchSpy.mockRestore();
      }
    },
    30_000,
  );

  (enabled ? it : it.skip)(
    "rolls back main Sheet writes when the success log fails",
    async () => {
      const quotedSchema = `"${databaseSchema}"`;
      const date = new Date("2026-10-18T00:00:00.000Z");
      await prisma.landStatRecord.create({
        data: {
          id: "rollback-row",
          reportDate: date,
          fieldCode: "OWNER_MISMATCH",
          commune: "Độc Lập",
          bookCount: 3,
          parcelCount: 30,
          source: "MANUAL",
        },
      });
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION ${quotedSchema}.reject_sheet_sync_success()
        RETURNS trigger LANGUAGE plpgsql AS $function$
        BEGIN
          IF NEW.source = 'SHEET_SYNC' AND NEW.status = 'SUCCESS' THEN
            RAISE EXCEPTION 'Injected success log failure';
          END IF;
          RETURN NEW;
        END;
        $function$
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER reject_sheet_sync_success
        BEFORE INSERT ON ${quotedSchema}.sync_logs
        FOR EACH ROW EXECUTE FUNCTION ${quotedSchema}.reject_sheet_sync_success()
      `);
      const fetchSpy = jest.spyOn(global, "fetch").mockResolvedValue({
        ok: true,
        text: async () =>
          "1,SAI LỆCH THÔNG TIN,18/10/2026,Độc Lập,,12,120",
      } as Response);

      try {
        await expect(
          service.syncFromGoogleSheet({ sheetUrl: testUrls.main }),
        ).rejects.toThrow();
        await expect(
          prisma.landStatRecord.findUniqueOrThrow({
            where: { id: "rollback-row" },
          }),
        ).resolves.toMatchObject({
          source: "MANUAL",
          bookCount: 3,
          parcelCount: 30,
        });
        expect(
          await prisma.syncLog.count({
            where: { source: "SHEET_SYNC", status: "SUCCESS" },
          }),
        ).toBe(0);
        expect(
          await prisma.syncLog.count({
            where: { source: "SHEET_SYNC", status: "FAILED" },
          }),
        ).toBe(1);
      } finally {
        fetchSpy.mockRestore();
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS reject_sheet_sync_success ON ${quotedSchema}.sync_logs`,
        );
        await prisma.$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS ${quotedSchema}.reject_sheet_sync_success()`,
        );
      }
    },
    30_000,
  );

  (enabled ? it : it.skip)(
    "preserves the previous module cache when its database write fails",
    async () => {
      const quotedSchema = `"${databaseSchema}"`;
      const previous = {
        twoTierConversion: { rows: [{ stt: 1, commune: "Old", parcelCount: 1 }], totalParcels: 1 },
        vnlisSync: { rows: [], totals: { extractedIlis: 0, signedXml: 0, pushedVnlis: 0, vnlisAddedResult: 0 } },
        populationMatch: { rows: [], totals: { sentPc06: 0, receivedMatched: 0, pushedOwnerInfo: 0, pushedPopulationParcels: 0, matchedProvinceWide: 1, unmatchedProvinceWide: 0, totalParcels: 1, matchedRate: "100%", unmatchedRate: "0%" } },
        syncedAt: "2026-10-29T00:00:00.000Z",
      };
      await prisma.syncLog.create({
        data: {
          id: "SHEET_MODULES_STATE",
          source: "SHEET_MODULES",
          recordsSynced: 1,
          status: "SUCCESS",
          message: JSON.stringify(previous),
        },
      });
      await prisma.$executeRawUnsafe(`
        CREATE FUNCTION ${quotedSchema}.reject_module_cache_update()
        RETURNS trigger LANGUAGE plpgsql AS $function$
        BEGIN
          IF OLD.id = 'SHEET_MODULES_STATE' THEN
            RAISE EXCEPTION 'Injected cache update failure';
          END IF;
          RETURN NEW;
        END;
        $function$
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TRIGGER reject_module_cache_update
        BEFORE UPDATE ON ${quotedSchema}.sync_logs
        FOR EACH ROW EXECUTE FUNCTION ${quotedSchema}.reject_module_cache_update()
      `);
      const fetchSpy = jest.spyOn(global, "fetch").mockImplementation(async (input) => {
        const gid = new URL(String(input)).searchParams.get("gid");
        const csv =
          gid === "2"
            ? "STT,Tên xã,Số thửa\n1,Trà Lĩnh,86"
            : gid === "3"
              ? "STT,Tên xã,Trích xuất từ iLIS,Ký số XML,Đẩy VNLIS,Kết quả VNLIS tăng thêm\n1,Trà Lĩnh,10,9,8,7"
              : "STT,Tên xã,Gửi PC06/xã,Nhận đã đối khớp,Đẩy thông tin chủ,Đẩy thông tin dân cư (theo thửa)," +
                '"Đã đối khớp thành công, toàn tỉnh","Chưa khớp, chưa đủ điều kiện, toàn tỉnh",Tổng thửa,' +
                '"Tỉ lệ đối khớp thành công (%)","Tỉ lệ chưa khớp, chưa đủ ĐK (%)"\n' +
                "1,Trà Lĩnh,1,1,1,1,1,1,2,50%,50%";
        return { ok: true, text: async () => csv } as Response;
      });

      try {
        await expect(service.syncSheetModules()).rejects.toThrow(
          "Không thể đồng bộ đầy đủ các Google Sheet phụ",
        );
        const cache = await prisma.syncLog.findUniqueOrThrow({
          where: { id: "SHEET_MODULES_STATE" },
        });
        expect(JSON.parse(cache.message!)).toEqual(previous);
        expect(
          await prisma.syncLog.count({
            where: { source: "SHEET_MODULES", status: "FAILED" },
          }),
        ).toBe(1);
      } finally {
        fetchSpy.mockRestore();
        await prisma.$executeRawUnsafe(
          `DROP TRIGGER IF EXISTS reject_module_cache_update ON ${quotedSchema}.sync_logs`,
        );
        await prisma.$executeRawUnsafe(
          `DROP FUNCTION IF EXISTS ${quotedSchema}.reject_module_cache_update()`,
        );
      }
    },
    30_000,
  );
});
