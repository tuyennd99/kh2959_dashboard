const defaultOrigin = 'http://localhost:5185,http://localhost:5173';
const defaultGoogleSheetUrl =
  'https://docs.google.com/spreadsheets/d/16WlVI8xzoxudlmCW7hiMsnynFEr1dNhXuPUBW4XmvzY/export?format=csv&gid=982199452';
const defaultTwoTierSheetUrl =
  'https://docs.google.com/spreadsheets/d/1SOaLTftRmFtYw937R6NIIHewdDEFJG3sSUf0azaSkNI/export?format=csv&gid=0';
const defaultVnlisSheetUrl =
  'https://docs.google.com/spreadsheets/d/1GYM2mqpc8vWB9EAgxcCSzuLFqKbRhOYB/export?format=csv&gid=1037546126';
const defaultPopulationSheetUrl =
  'https://docs.google.com/spreadsheets/d/1GYM2mqpc8vWB9EAgxcCSzuLFqKbRhOYB/export?format=csv&gid=2082395834';
const defaultChuanHoaApiUrl =
  'https://chuanhoa.minhhuub.org/api/public/v1/report';

export function requireSecret(name: string, value: string | undefined) {
  if (!value || Buffer.byteLength(value, 'utf8') < 32) {
    throw new Error(`${name} must be at least 32 bytes`);
  }
  return value;
}

export function env(values: NodeJS.ProcessEnv = process.env) {
  const port = Number(values.PORT ?? 3045);
  const trustProxyHops = Number(values.TRUST_PROXY_HOPS ?? 0);
  const allowedOrigins = (values.CORS_ORIGINS ?? defaultOrigin)
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  return {
    port: Number.isInteger(port) && port > 0 ? port : 3045,
    jwtSecret: requireSecret(
      'JWT_SECRET',
      values.JWT_SECRET ?? 'land-dashboard-default-jwt-secret-key-2026',
    ),
    trustProxyHops:
      Number.isInteger(trustProxyHops) && trustProxyHops >= 0
        ? trustProxyHops
        : 0,
    allowedOrigins,
    googleSheetCsvUrl: (
      values.GOOGLE_SHEET_CSV_URL ?? defaultGoogleSheetUrl
    ).trim(),
    twoTierSheetCsvUrl: (
      values.TWO_TIER_SHEET_CSV_URL ?? defaultTwoTierSheetUrl
    ).trim(),
    vnlisSheetCsvUrl: (
      values.VNLIS_SHEET_CSV_URL ?? defaultVnlisSheetUrl
    ).trim(),
    populationSheetCsvUrl: (
      values.POPULATION_SHEET_CSV_URL ?? defaultPopulationSheetUrl
    ).trim(),
    chuanHoaApiUrl: (values.CHUANHOA_API_URL ?? defaultChuanHoaApiUrl).trim(),
    chuanHoaApiToken: (values.CHUANHOA_API_TOKEN ?? '').trim(),
  };
}
