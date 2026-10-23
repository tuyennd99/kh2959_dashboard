import 'dotenv/config';
import * as bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { createPrismaAdapter } from '../../src/prisma/client';
import {
  CORE_FIELD_DEFINITIONS,
  RETIRED_FIELD_CODE,
} from '../../src/services/land-dashboard.service';
import { env } from '../../src/config/env';
import {
  normalizeGoogleSheetExportUrl,
  parseSheetCsv,
} from '../../src/utils/sheet-parser';

async function main() {
  const prisma = new PrismaClient({ adapter: createPrismaAdapter() });
  try {
    for (const def of CORE_FIELD_DEFINITIONS) {
      await prisma.fieldDefinition.upsert({
        where: { code: def.code },
        update: {
          label: def.label,
          sheetAlias: def.sheetAlias,
          isDefault: true,
        },
        create: def,
      });
    }

    const email = (
      process.env.BOOTSTRAP_ADMIN_EMAIL ?? 'admin@datdai.local'
    )
      .trim()
      .toLowerCase();
    const password = process.env.BOOTSTRAP_ADMIN_PASSWORD ?? 'Admin@123456';
    const hashedPassword = await bcrypt.hash(password, 10);

    await prisma.user.upsert({
      where: { email },
      update: { password: hashedPassword, isActive: true },
      create: {
        email,
        password: hashedPassword,
        fullName: 'Quản trị viên Đất đai',
        role: 'ADMIN',
        isActive: true,
      },
    });
    console.log(`Seeded admin account: ${email}`);

    const sheetUrl = normalizeGoogleSheetExportUrl(
      env(process.env).googleSheetCsvUrl,
    );
    try {
      const res = await fetch(sheetUrl);
      if (res.ok) {
        const csvText = await res.text();
        const fields = await prisma.fieldDefinition.findMany({
          where: { code: { not: RETIRED_FIELD_CODE } },
        });
        const rows = parseSheetCsv(csvText, fields);
        for (const row of rows) {
          const reportDate = new Date(`${row.reportDate}T00:00:00.000Z`);
          await prisma.landStatRecord.upsert({
            where: {
              reportDate_fieldCode_commune: {
                reportDate,
                fieldCode: row.fieldCode,
                commune: row.commune,
              },
            },
            update: {
              bookCount: row.bookCount,
              parcelCount: row.parcelCount,
              source: 'SHEET_SYNC',
            },
            create: {
              reportDate,
              fieldCode: row.fieldCode,
              commune: row.commune,
              bookCount: row.bookCount,
              parcelCount: row.parcelCount,
              source: 'SHEET_SYNC',
            },
          });
        }
        await prisma.syncLog.create({
          data: {
            source: 'SHEET_SYNC',
            sheetUrl,
            recordsSynced: rows.length,
            status: 'SUCCESS',
            message: `Seed đồng bộ ${rows.length} nhóm dữ liệu từ Google Sheet`,
          },
        });
        console.log(`Synced ${rows.length} grouped records from Google Sheet`);
      }
    } catch (err) {
      console.warn('Skipped initial Google Sheet sync during seed:', err);
    }
  } finally {
    await prisma.$disconnect();
  }
}

void main();
