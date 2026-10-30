import { PrismaService } from '../prisma/prisma.service';
import { SheetSyncLockService } from './sheet-sync-lock.service';

describe('SheetSyncLockService PostgreSQL integration', () => {
  const enabled = Boolean(
    process.env.DATABASE_URL && process.env.SHEET_SYNC_LOCK_DATABASE_URL,
  );
  let prisma: PrismaService;

  beforeAll(() => {
    if (enabled) prisma = new PrismaService();
  });

  afterAll(async () => {
    if (prisma) await prisma.$disconnect();
  });

  (enabled ? it : it.skip)(
    'serializes two instances and rejects an expired fencing token',
    async () => {
      const firstLock = new SheetSyncLockService(prisma);
      const secondLock = new SheetSyncLockService(prisma);
      let enterFirst!: (token: bigint) => void;
      let releaseFirst!: () => void;
      const entered = new Promise<bigint>((resolve) => {
        enterFirst = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });

      const first = firstLock.withSheetSyncLock(async ({ token }) => {
        enterFirst(token);
        await release;
        return token;
      });

      const oldToken = await Promise.race([
        entered,
        first.then(() => {
          throw new Error('First lock callback did not start');
        }),
      ]);
      try {
        await expect(
          secondLock.withSheetSyncLock(async () => 'must not run'),
        ).resolves.toBeNull();
      } finally {
        releaseFirst();
      }
      await first;

      const nextToken = await secondLock.withSheetSyncLock(
        async ({ token }) => token,
      );
      expect(nextToken).toBeGreaterThan(oldToken);
      await expect(
        prisma.$transaction((tx) =>
          secondLock.assertCurrentSheetSyncLease(tx, { token: oldToken }),
        ),
      ).rejects.toThrow('Sheet sync lease expired');
    },
    30_000,
  );

  (enabled ? it : it.skip)(
    'keeps the lease row locked until an in-flight write transaction finishes',
    async () => {
      const service = new SheetSyncLockService(prisma);
      const oldToken = await service.withSheetSyncLock(async ({ token }) => token);
      if (oldToken === null) throw new Error('Could not acquire test lock');
      const schema = new URL(process.env.DATABASE_URL!).searchParams.get('schema') ?? 'public';
      let enterWrite!: () => void;
      let releaseWrite!: () => void;
      const entered = new Promise<void>((resolve) => {
        enterWrite = resolve;
      });
      const release = new Promise<void>((resolve) => {
        releaseWrite = resolve;
      });
      const write = prisma.$transaction(async (tx) => {
        await service.assertCurrentSheetSyncLease(tx, { token: oldToken });
        enterWrite();
        await release;
      });
      await entered;

      let rotated = false;
      const rotate = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`
          SELECT set_config('search_path', quote_ident(${schema}), true)
        `;
        await tx.$executeRaw`
          UPDATE sheet_sync_leases SET token = token + 1 WHERE id = 'sheet-sync'
        `;
        rotated = true;
      });

      try {
        await new Promise((resolve) => setTimeout(resolve, 50));
        expect(rotated).toBe(false);
      } finally {
        releaseWrite();
      }
      await Promise.all([write, rotate]);
      expect(rotated).toBe(true);
      await expect(
        prisma.$transaction((tx) =>
          service.assertCurrentSheetSyncLease(tx, { token: oldToken }),
        ),
      ).rejects.toThrow('Sheet sync lease expired');
    },
    30_000,
  );
});
