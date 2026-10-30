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

    expect(work).toHaveBeenCalledWith(
      expect.objectContaining({ token: 41n, isActive: expect.any(Function) }),
    );
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

  it('sets the Prisma transaction search path before checking a custom-schema lease', async () => {
    process.env.DATABASE_URL = lockUrl.replace('schema=public', 'schema=sheet_sync_test');
    const service = new SheetSyncLockService(prisma);

    await prisma.$transaction((transaction) =>
      service.assertCurrentSheetSyncLease(transaction, { token: 40n }),
    );

    expect(tx.$queryRaw).toHaveBeenCalledTimes(2);
    expect(tx.$queryRaw.mock.calls[0][0].join('')).toContain(
      "set_config('search_path', quote_ident(",
    );
    expect(tx.$queryRaw.mock.calls[0][1]).toBe('sheet_sync_test');
    expect(tx.$queryRaw.mock.calls[1][0].join('')).toContain(
      'FROM sheet_sync_leases',
    );
  });

  it('fails the active run when the lock connection is lost', async () => {
    const service = new SheetSyncLockService(prisma);
    const loggerError = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    let leaseActiveAfterDisconnect: boolean | undefined;

    await expect(
      service.withSheetSyncLock(async (lease) => {
        onConnectionError?.(new Error('postgresql://user:secret@db.example/app'));
        leaseActiveAfterDisconnect = (lease as { isActive?: () => boolean }).isActive?.();
        return 'must not be reported as success';
      }),
    ).rejects.toThrow('Sheet sync lock connection lost');
    expect(client.end).toHaveBeenCalledTimes(1);
    expect(leaseActiveAfterDisconnect).toBe(false);
    expect(loggerError).toHaveBeenCalledWith('Sheet sync lock connection failed');
    loggerError.mockRestore();
  });

  it('rejects lock and database URLs that point to different databases', async () => {
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/other?schema=public';

    await expect(
      new SheetSyncLockService(prisma).withSheetSyncLock(async () => 'unused'),
    ).rejects.toThrow(
      'SHEET_SYNC_LOCK_DATABASE_URL must use the same connection endpoint and database as DATABASE_URL',
    );
    expect(Client).not.toHaveBeenCalled();
  });

  it('requires the same connection endpoint even when the database name matches', async () => {
    process.env.DATABASE_URL = lockUrl.replace('localhost:5432', 'pooler.example:6543');

    await expect(
      new SheetSyncLockService(prisma).withSheetSyncLock(async () => 'unused'),
    ).rejects.toThrow('same connection endpoint and database');
    expect(Client).not.toHaveBeenCalled();
  });

  it('quotes custom schema names on the PostgreSQL lock connection', async () => {
    const customUrl = lockUrl.replace('schema=public', 'schema=sheet-sync-test');
    process.env.DATABASE_URL = customUrl;
    process.env.SHEET_SYNC_LOCK_DATABASE_URL = customUrl;

    await new SheetSyncLockService(prisma).withSheetSyncLock(async () => 'done');

    expect(client.query).toHaveBeenCalledWith(
      "SELECT set_config('search_path', quote_ident($1), false)",
      ['sheet-sync-test'],
    );
  });
});
