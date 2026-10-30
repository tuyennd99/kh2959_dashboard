import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Client } from 'pg';
import { PrismaService } from '../prisma/prisma.service';

export type SyncLease = { token: bigint; isActive: () => boolean };

@Injectable()
export class SheetSyncLockService {
  private readonly logger = new Logger(SheetSyncLockService.name);

  constructor(private readonly prisma: PrismaService) {}

  async assertCurrentSheetSyncLease(
    tx: Prisma.TransactionClient,
    lease: Pick<SyncLease, 'token'>,
  ): Promise<void> {
    const rows = await tx.$queryRaw<Array<{ token: bigint }>>`
      SELECT token FROM sheet_sync_leases WHERE id = 'sheet-sync' FOR UPDATE
    `;
    if (rows[0]?.token !== lease.token) {
      throw new Error('Sheet sync lease expired');
    }
  }

  async withSheetSyncLock<T>(
    work: (lease: SyncLease) => Promise<T>,
  ): Promise<T | null> {
    const { connectionString, schema } = this.getLockDatabaseConfig();
    const client = new Client({ connectionString, connectionTimeoutMillis: 5000 });
    let ownsLock = false;
    let connectionLost = false;
    const onClientError = () => {
      connectionLost = true;
      this.logger.error('Sheet sync lock connection failed');
    };
    client.on('error', onClientError);

    try {
      await client.connect();
      await client.query("SELECT set_config('search_path', $1, false)", [schema]);
      await client.query("SELECT set_config('statement_timeout', $1, false)", ['5000']);
      // ponytail: one lock serializes every Sheet write; split by source only if sync throughput needs it.
      const lock = await client.query<{ acquired: boolean }>(
        "SELECT pg_try_advisory_lock(hashtext('land-sheet-sync-v1'), 1) AS acquired",
      );
      ownsLock = lock.rows[0]?.acquired === true;
      if (!ownsLock) return null;

      await client.query('BEGIN');
      let token: bigint;
      try {
        await client.query(
          "INSERT INTO sheet_sync_leases (id, token) VALUES ('sheet-sync', 0) ON CONFLICT (id) DO NOTHING",
        );
        const result = await client.query<{ token: string }>(
          "UPDATE sheet_sync_leases SET token = token + 1 WHERE id = 'sheet-sync' RETURNING token",
        );
        if (!result.rows[0]) throw new Error('Could not issue sheet sync lease');
        token = BigInt(result.rows[0].token);
        await client.query('COMMIT');
      } catch (error) {
        await client.query('ROLLBACK').catch(() => undefined);
        throw error;
      }

      if (connectionLost) throw new Error('Sheet sync lock connection lost');
      const result = await work({ token, isActive: () => !connectionLost });
      if (connectionLost) throw new Error('Sheet sync lock connection lost');
      return result;
    } finally {
      if (ownsLock && !connectionLost) {
        await client
          .query(
            "SELECT pg_advisory_unlock(hashtext('land-sheet-sync-v1'), 1)",
          )
          .catch(() => {
            connectionLost = true;
            this.logger.error('Could not release sheet sync lock');
          });
      }
      await client.end().catch(() => undefined);
      client.removeListener('error', onClientError);
    }
  }

  private getLockDatabaseConfig(): {
    connectionString: string;
    schema: string;
  } {
    const databaseUrl = process.env.DATABASE_URL;
    const lockUrl = process.env.SHEET_SYNC_LOCK_DATABASE_URL;
    if (!databaseUrl || !lockUrl) {
      throw new Error('SHEET_SYNC_LOCK_DATABASE_URL is required');
    }

    const database = new URL(databaseUrl);
    const lock = new URL(lockUrl);
    const databaseSchema = database.searchParams.get('schema') ?? 'public';
    const lockSchema = lock.searchParams.get('schema') ?? 'public';
    const sameDatabase =
      database.protocol === lock.protocol &&
      database.hostname === lock.hostname &&
      database.port === lock.port &&
      database.pathname === lock.pathname &&
      database.username === lock.username &&
      database.password === lock.password &&
      databaseSchema === lockSchema;
    if (!sameDatabase) {
      throw new Error('SHEET_SYNC_LOCK_DATABASE_URL must target DATABASE_URL');
    }

    lock.searchParams.delete('schema');
    if (
      lock.searchParams.get('sslmode') === 'require' &&
      !lock.searchParams.has('uselibpqcompat')
    ) {
      lock.searchParams.set('uselibpqcompat', 'true');
    }

    return { connectionString: lock.toString(), schema: lockSchema };
  }
}
