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
});
