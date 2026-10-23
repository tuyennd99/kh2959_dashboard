export type Role = 'ADMIN';

export type RecordSource = 'SHEET_SYNC' | 'MANUAL' | 'CSV_UPLOAD';

export const DEFAULT_FIELD_CODES = {
  OWNER_MISMATCH: 'OWNER_MISMATCH',
  OUT_OF_LIST_GCN: 'OUT_OF_LIST_GCN',
  STANDARDIZED_MAP_SHEETS: 'STANDARDIZED_MAP_SHEETS',
} as const;

export interface FieldDefinitionDto {
  id: string;
  code: string;
  label: string;
  sheetAlias: string | null;
  unit: string;
  isDefault: boolean;
  sortOrder: number;
}

export interface LandStatRecordDto {
  id: string;
  reportDate: string;
  fieldCode: string;
  fieldLabel?: string;
  commune: string;
  bookCount: number;
  parcelCount: number;
  extraData?: Record<string, number | string> | null;
  source: RecordSource;
  note?: string | null;
  updatedAt?: string;
}

export interface SyncLogDto {
  id: string;
  source: string;
  sheetUrl: string | null;
  recordsSynced: number;
  status: string;
  message: string | null;
  syncedAt: string;
}

export interface MetricPair {
  bookCount: number;
  parcelCount: number;
}

export interface DailySummaryItem {
  reportDate: string;
  values: Record<string, MetricPair>;
  totalBooks: number;
  totalParcels: number;
}

export interface CommuneSummaryItem {
  commune: string;
  bookCount: number;
  parcelCount: number;
  byField: Record<string, MetricPair>;
}

export interface DashboardSummaryDto {
  fields: FieldDefinitionDto[];
  totalsByField: Record<string, MetricPair>;
  grandTotal: MetricPair;
  byDate: DailySummaryItem[];
  byCommune: CommuneSummaryItem[];
  communes: string[];
  lastSync: SyncLogDto | null;
}

export interface ExternalStatusBreakdown {
  total: number;
  da_chuan: number;
  chua_chuan: number;
  bo_qua: number;
}

export interface ExternalChuanHoaReportDto {
  generated_at: string;
  files: ExternalStatusBreakdown;
  folders: ExternalStatusBreakdown;
  boxes: { total: number };
  gcn_total: number;
  branches: string[];
  branch: string;
  available?: boolean;
  errorMessage?: string;
}

export interface AuthUserDto {
  id: string;
  email: string;
  fullName: string;
  role: Role;
}

export interface LoginResponseDto {
  accessToken: string;
  user: AuthUserDto;
}

export interface ApiSuccess<T> {
  statusCode: number;
  data: T;
  message?: string;
  meta?: { page: number; limit: number; total: number; totalPages: number };
}

export interface ApiError {
  statusCode: number;
  message: string;
  requestId?: string;
}

export type ApiResult<T> = ApiSuccess<T> | ApiError;
