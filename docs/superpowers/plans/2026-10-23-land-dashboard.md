# Land Data Dashboard (`dashboarddatdai`) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a monorepo web + API application at `D:\project\dashboarddatdai` that displays public land-data dashboards (filters, KPI cards, charts, summary/detail tables, external report API integration) and provides authenticated management (Google Sheet one-click sync, manual entry form, CSV upload, and extensible custom fields).

**Architecture:** Derived from the `D:\project\chamdiemocop` monorepo base (`apps/web`, `apps/be`, `packages/shared`) with OCOP-specific domains removed. `apps/be` (NestJS + Prisma 7 + PostgreSQL) manages authentication, dynamic `FieldDefinition` metadata, `LandStatRecord` rows aggregated by `(reportDate, fieldCode, commune)` (no `staffName`), Google Sheet CSV parsing/upsert, and proxying `https://chuanhoa.minhhuub.org/api/public/v1/report`. `apps/web` (React 19 + Vite + TanStack Router/Query + Tailwind v4) provides a public `/` dashboard and an authenticated `/manage` workspace.

**Tech Stack:** pnpm workspaces, Node >=24.7, TypeScript, NestJS 11, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL, React 19, Vite 8, TanStack Router & Query, Tailwind CSS v4, Radix UI, Jest.

**Spec:** `docs/superpowers/specs/2026-10-23-land-dashboard-design.md`

## Global Constraints

- Target directory: `D:\project\dashboarddatdai`
- Do NOT include `staffName` ("Người làm") in database schema, API contracts, forms, filters, or tables.
- Google Sheet sync URL default: `https://docs.google.com/spreadsheets/d/16WlVI8xzoxudlmCW7hiMsnynFEr1dNhXuPUBW4XmvzY/export?format=csv&gid=982199452`
- Default 3 field definitions (`FieldDefinition`):
  1. `OWNER_MISMATCH`: label `"Sai Lệch Thông Tin CSH"`, sheetAlias `"SAI LỆCH THÔNG TIN"`
  2. `OUT_OF_LIST_GCN`: label `"GCN Ngoài Danh Sách"`, sheetAlias `"NGOÀI DANH SÁCH"`
  3. `STANDARDIZED_MAP_SHEETS`: label `"Số lượng tờ bản đồ đã chuẩn hóa"`, sheetAlias `"TỜ BẢN ĐỒ ĐÃ CHUẨN HÓA"`
- External API (`https://chuanhoa.minhhuub.org/api/public/v1/report`) Bearer token MUST reside in `apps/be/.env` (`CHUANHOA_API_TOKEN`) and never be hardcoded in frontend source.
- Public viewers access `/` without login; data entry, CSV upload, field creation, and Google Sheet sync require JWT authentication (`/login`, `/manage`).

## Review Focus

1. **Google Sheet formatted numbers & summary rows:** Numbers with thousand separators (`"1,383"`, `"10,667"`) must parse to integers (`1383`, `10667`), and `TỔNG CỘNG` / header rows must be skipped without throwing or double-counting.
2. **Same-day/same-category/same-commune rows after dropping `NGƯỜI LÀM`:** Multiple rows in the sheet on `18/10/2026` with `NGOÀI DANH SÁCH` and empty commune must be summed (`SUM(bookCount)`, `SUM(parcelCount)`) before upserting so the last row does not overwrite earlier rows.
3. **Vietnamese UTF-8 `branch` filter on external report API:** `branch=VPĐKĐĐ KV Hà Quảng` must be URI-encoded with `encodeURIComponent` when calling `chuanhoa.minhhuub.org` so UTF-8 characters are preserved and non-zero branch metrics are returned.
4. **Dynamic field extensibility:** Adding a new `FieldDefinition` (e.g., `NEW_METRIC`) must immediately appear in the dashboard KPI cards, filter dropdown, manual entry form, and Google Sheet/CSV mapper without schema changes.
5. **External API downtime fallback:** If `chuanhoa.minhhuub.org` times out or returns 5xx, `/api/dashboard/external-report` returns a structured fallback/error state without crashing the main land-statistics dashboard.

---

### Task 1: Workspace Base & Shared Contracts (`packages/shared`)

**Files:**
- Create: `D:\project\dashboarddatdai\package.json`
- Create: `D:\project\dashboarddatdai\pnpm-workspace.yaml`
- Create: `D:\project\dashboarddatdai\packages\shared\package.json`
- Create: `D:\project\dashboarddatdai\packages\shared\tsconfig.json`
- Create: `D:\project\dashboarddatdai\packages\shared\src\index.ts`

**Interfaces:**
- Produces:
  - `FieldDefinitionDto`: `{ id: string; code: string; label: string; sheetAlias: string | null; unit: string; isDefault: boolean; sortOrder: number }`
  - `LandStatRecordDto`: `{ id: string; reportDate: string; fieldCode: string; fieldLabel?: string; commune: string; bookCount: number; parcelCount: number; extraData?: Record<string, number | string> | null; source: 'SHEET_SYNC' | 'MANUAL' | 'CSV_UPLOAD'; note?: string | null; updatedAt?: string }`
  - `DashboardSummaryDto`: `{ fields: FieldDefinitionDto[]; totalsByField: Record<string, { bookCount: number; parcelCount: number }>; grandTotal: { bookCount: number; parcelCount: number }; byDate: Array<{ reportDate: string; values: Record<string, { bookCount: number; parcelCount: number }>; totalBooks: number; totalParcels: number }>; byCommune: Array<{ commune: string; bookCount: number; parcelCount: number; byField: Record<string, { bookCount: number; parcelCount: number }> }>; communes: string[]; lastSync: SyncLogDto | null }`
  - `ExternalChuanHoaReportDto`: `{ generated_at: string; files: { total: number; da_chuan: number; chua_chuan: number; bo_qua: number }; folders: { total: number; da_chuan: number; chua_chuan: number; bo_qua: number }; boxes: { total: number }; gcn_total: number; branches: string[]; branch: string }`
  - `ApiSuccess<T>`, `ApiError`, `ApiResult<T>`

- [ ] **Step 1: Scaffold workspace config and `packages/shared` from base**
- [ ] **Step 2: Implement shared TypeScript interfaces in `packages/shared/src/index.ts`**
- [ ] **Step 3: Verify `packages/shared` compiles with `tsc --noEmit`**

---

### Task 2: Backend Core, Prisma Schema & CSV/Sheet Parser (`apps/be`)

**Files:**
- Create: `D:\project\dashboarddatdai\apps\be\package.json`
- Create: `D:\project\dashboarddatdai\apps\be\prisma\schema.prisma`
- Create: `D:\project\dashboarddatdai\apps\be\prisma.config.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\utils\sheet-parser.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\utils\sheet-parser.spec.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\config\env.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\config\app.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\prisma\client.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\prisma\prisma.service.ts`

**Interfaces:**
- Consumes: `@land/shared` types
- Produces:
  - `parseSheetCsv(csvText: string, fieldDefs: Pick<FieldDefinitionDto, 'code' | 'label' | 'sheetAlias'>[]): AggregatedSheetRow[]`
  - `AggregatedSheetRow`: `{ reportDate: string; fieldCode: string; commune: string; bookCount: number; parcelCount: number }`

- [ ] **Step 1: Write failing unit tests in `apps/be/src/utils/sheet-parser.spec.ts`**
  - Test parsing formatted numbers (`"1,383"` -> `1383`).
  - Test skipping header and `TỔNG CỘNG` rows.
  - Ignore retired `BA HUYỆN CŨ` rows. Test `NGOÀI DANH SÁCH` and `SAI LỆCH THÔNG TIN` aggregation with totals of `2491` books and `6938` parcels for the sample rows.
  - Test matching dynamic `FieldDefinition` aliases.
- [ ] **Step 2: Run Jest on `sheet-parser.spec.ts` to verify failure**
- [ ] **Step 3: Implement `parseSheetCsv` in `apps/be/src/utils/sheet-parser.ts` and Prisma schema in `apps/be/prisma/schema.prisma`**
- [ ] **Step 4: Run Jest to verify `sheet-parser.spec.ts` passes**

---

### Task 3: Backend Services & Controllers (Auth, Dashboard, Sync, External API, CRUD)

**Files:**
- Create: `D:\project\dashboarddatdai\apps\be\src\services\auth.service.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\services\land-dashboard.service.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\services\land-dashboard.service.spec.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\controllers\auth.controller.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\controllers\dashboard.controller.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\controllers\manage.controller.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\dtos\land.dto.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\app.module.ts`
- Create: `D:\project\dashboarddatdai\apps\be\src\main.ts`
- Create: `D:\project\dashboarddatdai\apps\be\prisma\seed\seed.ts`

**Interfaces:**
- Public endpoints:
  - `GET /api/health`
  - `GET /api/dashboard/summary?fromDate=&toDate=&fieldCode=&commune=`
  - `GET /api/dashboard/records?fromDate=&toDate=&fieldCode=&commune=&search=&page=&limit=`
  - `GET /api/dashboard/external-report?branch=`
  - `GET /api/dashboard/fields`
  - `POST /api/auth/login`
- Protected endpoints (`JwtAuthGuard`):
  - `GET /api/auth/me`
  - `POST /api/manage/sync-sheet` (`{ sheetUrl?: string; replaceExisting?: boolean }`)
  - `POST /api/manage/import-csv` (`{ csvContent: string; replaceExisting?: boolean }`)
  - `POST /api/manage/records` (create/upsert single record)
  - `PUT /api/manage/records/:id`
  - `DELETE /api/manage/records/:id`
  - `POST /api/manage/fields` (add new dynamic field definition)
  - `DELETE /api/manage/fields/:id` (delete non-default field definition)

- [ ] **Step 1: Write unit tests in `apps/be/src/services/land-dashboard.service.spec.ts` covering summary aggregation, UTF-8 branch encoding for external report API, and external API error fallback**
- [ ] **Step 2: Implement `LandDashboardService`, `AuthService`, controllers, guards, and seed script**
- [ ] **Step 3: Run `pnpm --filter @land/api test` and `pnpm --filter @land/api typecheck`**

---

### Task 4: Frontend Application (`apps/web`) — Public Dashboard & Admin Management

**Files:**
- Create: `D:\project\dashboarddatdai\apps\web\package.json`
- Create: `D:\project\dashboarddatdai\apps\web\src\api\dashboard.ts`
- Create: `D:\project\dashboarddatdai\apps\web\src\api\manage.ts`
- Create: `D:\project\dashboarddatdai\apps\web\src\api\auth.ts`
- Create: `D:\project\dashboarddatdai\apps\web\src\pages\public\DashboardPage.tsx`
- Create: `D:\project\dashboarddatdai\apps\web\src\pages\manage\ManagePage.tsx`
- Create: `D:\project\dashboarddatdai\apps\web\src\pages\auth\LoginPage.tsx`
- Create: `D:\project\dashboarddatdai\apps\web\src\components\charts\DashboardCharts.tsx`

**Interfaces:**
- Consumes: `/api/dashboard/*`, `/api/manage/*`, `/api/auth/*`, `@land/shared`
- Produces:
  - Public `/` page with:
    1. External Standardization Report section (`chuanhoa.minhhuub.org`) with branch filter (`Tất cả`, `VPĐKĐĐ KV Hà Quảng`, `VPĐKĐĐ KV Nguyên Bình`), KPI cards (`Tổng GCN`, `Tổng Hộp`, `Files đã chuẩn`, `Folders đã chuẩn`), and visual progress/donut charts (`Đã chuẩn`, `Chưa chuẩn`, `Bỏ qua`).
    2. Land Statistics section with filters (`Từ ngày`, `Đến ngày`, `Loại dữ liệu`, `Xã`, toggle `Số sổ / Số thửa`), KPI cards for all active `FieldDefinition` items (`Sai Lệch Thông Tin CSH`, `GCN Ngoài Danh Sách`, `Số lượng tờ bản đồ đã chuẩn hóa`, plus custom fields; retired `THREE_OLD_DISTRICTS` is hidden), interactive Stacked Bar Chart by Date, Horizontal Bar Chart by Category & Commune, Daily Pivot Summary Table, and Paginated Records Table.
  - Login page `/login` & Management page `/manage` with:
    1. One-click **Đồng bộ từ Google Sheet** button + custom sheet link input + sync history status.
    2. **Form nhập liệu** (Date, Field, Commune, Số sổ, Số thửa, Ghi chú) + edit/delete in table.
    3. **Upload file CSV** (drag/select `.csv` file or paste CSV).
    4. **Quản lý trường mở rộng** (thêm trường mới để mở rộng về sau).

- [ ] **Step 1: Copy web base (`components/ui`, `lib`, `stores`, Tailwind/Vite configs) to `D:\project\dashboarddatdai\apps\web`**
- [ ] **Step 2: Implement API layer, `DashboardCharts.tsx`, `DashboardPage.tsx`, `LoginPage.tsx`, `ManagePage.tsx`, and routes**
- [ ] **Step 3: Run `pnpm typecheck` and `pnpm build` across `D:\project\dashboarddatdai`**
