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
  const cleaned = raw.replace(/[,\s"]/g, '');
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

export function normalizeGoogleSheetExportUrl(inputUrl: string): string {
  const trimmed = inputUrl.trim();
  if (trimmed.includes('/export?format=csv')) {
    return trimmed;
  }
  const sheetIdMatch = /\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/.exec(trimmed);
  if (!sheetIdMatch) {
    return trimmed;
  }
  const spreadsheetId = sheetIdMatch[1];
  const gidMatch = /[?#&]gid=(\d+)/.exec(trimmed);
  const gid = gidMatch ? gidMatch[1] : '0';
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
