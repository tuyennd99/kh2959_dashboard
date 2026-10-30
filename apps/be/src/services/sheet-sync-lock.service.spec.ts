import { Logger } from '@nestjs/common';
import { Client } from 'pg';
import type { PrismaService } from '../prisma/prisma.service';
import { SheetSyncLockService } from './sheet-sync-lock.service';

jest.mock('pg', () => ({ Client: jest.fn() }));
jest.mock('../prisma/prisma.service', () => ({ PrismaService: class {} }));

describe('SheetSyncLockService', () => {
  const lockUrl = 'postgresql://postgres:postgres@localhost:5432/dashboarddatdai?schema=public';
  const previousLockUrl = process.env.SHEET_SYNC_LOCK_DATABASE_URL;
  const previousDatabaseUrl = process.env.DATABASE_URL;
  let acquired: boolean;
  let nextToken: bigint;
  let onConnectionError: ((error: Error) => void) | undefined;
  let client: {
    connect: jest.Mock;
    query: jest.Mock;
    end: jest.Mock;
    on: jest.Mock;
    removeListener: jest.Mock;
  };
  let prisma: PrismaService;
  let tx: { $queryRaw: jest.Mock };

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.SHEET_SYNC_LOCK_DATABASE_URL = lockUrl;
    process.env.DATABASE_URL = lockUrl;
    acquired = true;
    nextToken = 40n;
    onConnectionError = undefined;
    client = {
      connect: jest.fn().mockResolvedValue(undefined),
      query: jest.fn(async (sql: string) => {
        if (sql.includes('pg_try_advisory_lock')) {
          return { rows: [{ acquired }] };
        }
        if (sql.includes('UPDATE sheet_sync_leases')) {
          nextToken += 1n;
          return { rows: [{ token: nextToken }] };
        }
        return { rows: [] };
      }),
      end: jest.fn().mockResolvedValue(undefined),
      on: jest.fn((_event: string, callback: (error: Error) => void) => {
        onConnectionError = callback;
      }),
      removeListener: jest.fn(),
    };
    (Client as unknown as jest.Mock).mockImplementation(() => client);
    tx = { $queryRaw: jest.fn().mockResolvedValue([{ token: nextToken }]) };
    prisma = {
      $transaction: jest.fn((callback) => callback(tx)),
    } as unknown as PrismaService;
  });

  afterEach(() => {
    if (previousLockUrl === undefined) delete process.env.SHEET_SYNC_LOCK_DATABASE_URL;
    else process.env.SHEET_SYNC_LOCK_DATABASE_URL = previousLockUrl;
    if (previousDatabaseUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousDatabaseUrl;
  });

  it('skips the callback when another instance owns the PostgreSQL lock', async () => {
    acquired = false;
    const work = jest.fn();
    const result = await new SheetSyncLockService(prisma).withSheetSyncLock(work);

    expect(result).toBeNull();
    expect(work).not.toHaveBeenCalled();
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('issues a fencing token and releases the session lock after work fails', async () => {
    tx.$queryRaw.mockResolvedValue([{ token: 41n }]);
    const service = new SheetSyncLockService(prisma);
    const work = jest.fn(async () => {
      await prisma.$transaction((transaction) =>
        service.assertCurrentSheetSyncLease(transaction, { token: 41n }),
      );
      throw new Error('sync failed');
    });

    await expect(service.withSheetSyncLock(work)).rejects.toThrow('sync failed');

    expect(work).toHaveBeenCalledWith({ token: 41n });
    expect(client.query).toHaveBeenCalledWith(
      expect.stringContaining('pg_advisory_unlock'),
    );
    expect(client.end).toHaveBeenCalledTimes(1);
  });

  it('rejects a lease after a newer owner increments its token', async () => {
    tx.$queryRaw.mockResolvedValue([{ token: 42n }]);
    const service = new SheetSyncLockService(prisma);

    await expect(
      prisma.$transaction((transaction) =>
        service.assertCurrentSheetSyncLease(transaction, { token: 41n }),
      ),
    ).rejects.toThrow('Sheet sync lease expired');
  });

  it('fails the active run when the lock connection is lost', async () => {
    const service = new SheetSyncLockService(prisma);
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);

    await expect(
      service.withSheetSyncLock(async () => {
        onConnectionError?.(new Error('postgresql://user:secret@db.example/app'));
        return 'must not be reported as success';
      }),
    ).rejects.toThrow('Sheet sync lock connection lost');
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(loggerError).toHaveBeenCalledWith('Sheet sync lock connection failed');
    loggerError.mockRestore();
  });

  it('rejects lock and database URLs that point to different databases', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/other?schema=public';

    await expect(
      new SheetSyncLockService(prisma).withSheetSyncLock(async () => 'unused'),
    ).rejects.toThrow('SHEET_SYNC_LOCK_DATABASE_URL must target DATABASE_URL');
    expect(Client).not.toHaveBeenCalled();
  });
});
