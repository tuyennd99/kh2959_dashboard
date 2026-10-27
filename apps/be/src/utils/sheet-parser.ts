import type {
  PopulationMatchReportDto,
  PopulationMatchRowDto,
  TwoTierConversionReportDto,
  TwoTierConversionRowDto,
  VnlisSyncReportDto,
  VnlisSyncRowDto,
} from '@land/shared';

export interface FieldMatcherInput {
  code: string;
  label: string;
  sheetAlias: string | null;
}

export interface AggregatedSheetRow {
  reportDate: string;
  fieldCode: string;
  commune: string;
  bookCount: number;
  parcelCount: number;
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

export function parseFormattedInt(raw: string | undefined): number {
  if (!raw) return 0;
  const cleaned = raw.replace(/[.,\s"]/g, '');
  if (!cleaned) return 0;
  const num = Number.parseInt(cleaned, 10);
  return Number.isFinite(num) ? num : 0;
}

export function parseDateToIso(raw: string | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  const dmyMatch = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(trimmed);
  if (dmyMatch) {
    const day = dmyMatch[1].padStart(2, '0');
    const month = dmyMatch[2].padStart(2, '0');
    const year = dmyMatch[3];
    return `${year}-${month}-${day}`;
  }
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (isoMatch) {
    return trimmed;
  }
  return null;
}

function normalizeKey(value: string): string {
  return value.trim().toUpperCase().replace(/\s+/g, ' ');
}

function resolveFieldCode(
  rawType: string,
  fieldDefs: FieldMatcherInput[],
): string | null {
  const key = normalizeKey(rawType);
  if (!key || key === 'TỔNG CỘNG' || key === 'LOẠI DỮ LIỆU') {
    return null;
  }

  for (const def of fieldDefs) {
    if (
      normalizeKey(def.code) === key ||
      normalizeKey(def.label) === key ||
      (def.sheetAlias && normalizeKey(def.sheetAlias) === key)
    ) {
      return def.code;
    }
  }

  // Built-in fallbacks for supported core fields
  if (key.includes('NGOÀI DANH SÁCH')) {
    return 'OUT_OF_LIST_GCN';
  }
  if (key.includes('SAI LỆCH THÔNG TIN')) {
    return 'OWNER_MISMATCH';
  }
  if (key.includes('TỜ BẢN ĐỒ')) {
    return 'STANDARDIZED_MAP_SHEETS';
  }

  return null;
}

export function normalizeGoogleSheetExportUrl(
  inputUrl: string,
  overrideGid?: string,
): string {
  const trimmed = inputUrl.trim();
  const sheetIdMatch = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (!sheetIdMatch) {
    return trimmed;
  }
  const spreadsheetId = sheetIdMatch[1];
  const gidMatch = /[?#&]gid=(\d+)/.exec(trimmed);
  const gid = overrideGid ?? (gidMatch ? gidMatch[1] : '0');
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=csv&gid=${gid}`;
}

export function parseSheetCsv(
  csvText: string,
  fieldDefs: FieldMatcherInput[],
): AggregatedSheetRow[] {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const grouped = new Map<string, AggregatedSheetRow>();

  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 6) continue;

    // Expected columns: STT (0), LOẠI DỮ LIỆU (1), NGÀY THỰC HIỆN (2), XÃ (3), NGƯỜI LÀM (4 - ignored), SỐ SỔ (5), SỐ THỬA (6)
    const rawType = cols[1] ?? '';
    const rawDate = cols[2] ?? '';
    const rawCommune = (cols[3] ?? '').trim();
    // cols[4] is NGƯỜI LÀM -> explicitly ignored per requirement
    const rawBooks = cols[5];
    const rawParcels = cols[6];

    const reportDate = parseDateToIso(rawDate);
    if (!reportDate) continue;

    const fieldCode = resolveFieldCode(rawType, fieldDefs);
    if (!fieldCode) continue;

    const bookCount = parseFormattedInt(rawBooks);
    const parcelCount = parseFormattedInt(rawParcels);
    if (bookCount === 0 && parcelCount === 0) continue;

    const mapKey = `${reportDate}__${fieldCode}__${rawCommune}`;
    const existing = grouped.get(mapKey);
    if (existing) {
      existing.bookCount += bookCount;
      existing.parcelCount += parcelCount;
    } else {
      grouped.set(mapKey, {
        reportDate,
        fieldCode,
        commune: rawCommune,
        bookCount,
        parcelCount,
      });
    }
  }

  return Array.from(grouped.values());
}

export function parseTwoTierConversionCsv(
  csvText: string,
): TwoTierConversionReportDto {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: TwoTierConversionRowDto[] = [];
  let totalFromFooter = 0;

  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 3) continue;

    const first = normalizeKey(cols[0] ?? '');
    const second = normalizeKey(cols[1] ?? '');
    if (first.includes('TỔNG CỘNG') || second.includes('TỔNG CỘNG')) {
      totalFromFooter = parseFormattedInt(cols[2]);
      continue;
    }

    const stt = Number.parseInt(cols[0] ?? '', 10);
    if (!Number.isFinite(stt) || stt <= 0) continue;

    const commune = (cols[1] ?? '').trim();
    const parcelCount = parseFormattedInt(cols[2]);
    if (!commune && parcelCount === 0) continue;

    rows.push({ stt, commune, parcelCount });
  }

  const sumParcels = rows.reduce((sum, r) => sum + r.parcelCount, 0);
  return {
    rows,
    totalParcels: totalFromFooter > 0 ? totalFromFooter : sumParcels,
  };
}

export function parseVnlisSyncCsv(csvText: string): VnlisSyncReportDto {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: VnlisSyncRowDto[] = [];
  let footerTotals: VnlisSyncReportDto['totals'] | null = null;

  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 6) continue;

    const first = normalizeKey(cols[0] ?? '');
    const second = normalizeKey(cols[1] ?? '');
    if (first.includes('TỔNG CỘNG') || second.includes('TỔNG CỘNG')) {
      footerTotals = {
        extractedIlis: parseFormattedInt(cols[2]),
        signedXml: parseFormattedInt(cols[3]),
        pushedVnlis: parseFormattedInt(cols[4]),
        vnlisAddedResult: parseFormattedInt(cols[5]),
      };
      continue;
    }

    const stt = Number.parseInt(cols[0] ?? '', 10);
    if (!Number.isFinite(stt) || stt <= 0) continue;

    const commune = (cols[1] ?? '').trim();
    const extractedIlis = parseFormattedInt(cols[2]);
    const signedXml = parseFormattedInt(cols[3]);
    const pushedVnlis = parseFormattedInt(cols[4]);
    const vnlisAddedResult = parseFormattedInt(cols[5]);

    if (
      !commune &&
      extractedIlis === 0 &&
      signedXml === 0 &&
      pushedVnlis === 0 &&
      vnlisAddedResult === 0
    ) {
      continue;
    }

    rows.push({
      stt,
      commune,
      extractedIlis,
      signedXml,
      pushedVnlis,
      vnlisAddedResult,
    });
  }

  const computedTotals = rows.reduce(
    (acc, r) => ({
      extractedIlis: acc.extractedIlis + r.extractedIlis,
      signedXml: acc.signedXml + r.signedXml,
      pushedVnlis: acc.pushedVnlis + r.pushedVnlis,
      vnlisAddedResult: acc.vnlisAddedResult + r.vnlisAddedResult,
    }),
    { extractedIlis: 0, signedXml: 0, pushedVnlis: 0, vnlisAddedResult: 0 },
  );

  return {
    rows,
    totals: footerTotals ?? computedTotals,
  };
}

export function parsePopulationMatchCsv(
  csvText: string,
): PopulationMatchReportDto {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const rows: PopulationMatchRowDto[] = [];
  let totals: PopulationMatchReportDto['totals'] = {
    sentPc06: 0,
    receivedMatched: 0,
    pushedOwnerInfo: 0,
    pushedPopulationParcels: 0,
    matchedProvinceWide: 1_295_709,
    unmatchedProvinceWide: 550_861,
    totalParcels: 1_846_570,
    matchedRate: '70,17%',
    unmatchedRate: '29,83%',
  };
  let foundProvinceTotals = false;

  for (const line of lines) {
    const cols = parseCsvLine(line);
    if (cols.length < 6) continue;

    const first = normalizeKey(cols[0] ?? '');
    const second = normalizeKey(cols[1] ?? '');
    const matchedProvince = parseFormattedInt(cols[6]);
    const unmatchedProvince = parseFormattedInt(cols[7]);
    const totalProvince = parseFormattedInt(cols[8]);
    const matchedRate = (cols[9] ?? '').trim();
    const unmatchedRate = (cols[10] ?? '').trim();

    if (first.includes('TỔNG CỘNG') || second.includes('TỔNG CỘNG')) {
      totals = {
        sentPc06: parseFormattedInt(cols[2]),
        receivedMatched: parseFormattedInt(cols[3]),
        pushedOwnerInfo: parseFormattedInt(cols[4]),
        pushedPopulationParcels: parseFormattedInt(cols[5]),
        matchedProvinceWide:
          matchedProvince > 0 ? matchedProvince : totals.matchedProvinceWide,
        unmatchedProvinceWide:
          unmatchedProvince > 0
            ? unmatchedProvince
            : totals.unmatchedProvinceWide,
        totalParcels: totalProvince > 0 ? totalProvince : totals.totalParcels,
        matchedRate: matchedRate || totals.matchedRate,
        unmatchedRate: unmatchedRate || totals.unmatchedRate,
      };
      foundProvinceTotals = true;
      continue;
    }

    const stt = Number.parseInt(cols[0] ?? '', 10);
    if (!Number.isFinite(stt) || stt <= 0) continue;

    const commune = (cols[1] ?? '').trim();
    const sentPc06 = parseFormattedInt(cols[2]);
    const receivedMatched = parseFormattedInt(cols[3]);
    const pushedOwnerInfo = parseFormattedInt(cols[4]);
    const pushedPopulationParcels = parseFormattedInt(cols[5]);

    if (!foundProvinceTotals && totalProvince > 0) {
      totals = {
        ...totals,
        matchedProvinceWide: matchedProvince,
        unmatchedProvinceWide: unmatchedProvince,
        totalParcels: totalProvince,
        matchedRate: matchedRate || totals.matchedRate,
        unmatchedRate: unmatchedRate || totals.unmatchedRate,
      };
      foundProvinceTotals = true;
    }

    if (
      !commune &&
      sentPc06 === 0 &&
      receivedMatched === 0 &&
      pushedOwnerInfo === 0 &&
      pushedPopulationParcels === 0
    ) {
      continue;
    }

    rows.push({
      stt,
      commune,
      sentPc06,
      receivedMatched,
      pushedOwnerInfo,
      pushedPopulationParcels,
    });
  }

  if (totals.sentPc06 === 0 && rows.length > 0) {
    for (const r of rows) {
      totals.sentPc06 += r.sentPc06;
      totals.receivedMatched += r.receivedMatched;
      totals.pushedOwnerInfo += r.pushedOwnerInfo;
      totals.pushedPopulationParcels += r.pushedPopulationParcels;
    }
  }

  return { rows, totals };
}
