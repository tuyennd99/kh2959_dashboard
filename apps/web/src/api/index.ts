import type {
  AuthUserDto,
  DashboardSummaryDto,
  ExternalChuanHoaReportDto,
  FieldDefinitionDto,
  GoogleSheetModulesDto,
  LandStatRecordDto,
  LoginResponseDto,
  SyncLogDto,
} from '@land/shared';
import { requestJson } from './base-request';

export interface DashboardFilterParams {
  fromDate?: string;
  toDate?: string;
  fieldCode?: string;
  commune?: string;
  search?: string;
  page?: number;
  limit?: number;
}

export async function fetchDashboardSummary(params: DashboardFilterParams) {
  const res = await requestJson<DashboardSummaryDto>({
    method: 'GET',
    url: '/dashboard/summary',
    params,
  });
  return res.data;
}

export async function fetchDashboardRecords(params: DashboardFilterParams) {
  return requestJson<LandStatRecordDto[]>({
    method: 'GET',
    url: '/dashboard/records',
    params,
  });
}

export async function fetchFieldDefinitions() {
  const res = await requestJson<FieldDefinitionDto[]>({
    method: 'GET',
    url: '/dashboard/fields',
  });
  return res.data;
}

export async function fetchExternalReport(branch?: string) {
  const res = await requestJson<ExternalChuanHoaReportDto>({
    method: 'GET',
    url: '/dashboard/external-report',
    params: branch ? { branch } : undefined,
  });
  return res.data;
}

export async function fetchSheetModules(refresh?: boolean) {
  const res = await requestJson<GoogleSheetModulesDto>({
    method: 'GET',
    url: '/dashboard/sheet-modules',
    params: refresh ? { refresh: '1' } : undefined,
  });
  return res.data;
}

export async function loginApi(payload: { email: string; password: string }) {
  const res = await requestJson<LoginResponseDto>({
    method: 'POST',
    url: '/auth/login',
    data: payload,
  });
  return res.data;
}

export async function fetchMeApi() {
  const res = await requestJson<AuthUserDto>({
    method: 'GET',
    url: '/auth/me',
  });
  return res.data;
}

export async function syncGoogleSheetApi(payload: {
  sheetUrl?: string;
  twoTierSheetUrl?: string;
  vnlisSheetUrl?: string;
  replaceExisting?: boolean;
}) {
  const res = await requestJson<SyncLogDto>({
    method: 'POST',
    url: '/manage/sync-sheet',
    data: payload,
  });
  return res.data;
}

export async function importCsvApi(payload: {
  csvContent: string;
  replaceExisting?: boolean;
}) {
  const res = await requestJson<SyncLogDto>({
    method: 'POST',
    url: '/manage/import-csv',
    data: payload,
  });
  return res.data;
}

export async function upsertLandRecordApi(payload: {
  reportDate: string;
  fieldCode: string;
  commune?: string;
  bookCount: number;
  parcelCount: number;
  extraData?: Record<string, number | string>;
  note?: string;
}) {
  const res = await requestJson<LandStatRecordDto>({
    method: 'POST',
    url: '/manage/records',
    data: payload,
  });
  return res.data;
}

export async function deleteLandRecordApi(id: string) {
  const res = await requestJson<{ deleted: boolean }>({
    method: 'DELETE',
    url: `/manage/records/${id}`,
  });
  return res.data;
}

export async function createFieldDefinitionApi(payload: {
  code: string;
  label: string;
  sheetAlias?: string;
  unit?: string;
}) {
  const res = await requestJson<FieldDefinitionDto>({
    method: 'POST',
    url: '/manage/fields',
    data: payload,
  });
  return res.data;
}

export async function deleteFieldDefinitionApi(id: string) {
  const res = await requestJson<{ deleted: boolean }>({
    method: 'DELETE',
    url: `/manage/fields/${id}`,
  });
  return res.data;
}
