# Đồng bộ Google Sheet hằng ngày Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tự động đồng bộ ba liên kết Google Sheet hiện có mỗi ngày, lấy số liệu từ Sheet và bảo toàn dữ liệu khi nguồn lỗi.

**Architecture:** Scheduler NestJS điều phối một lượt, dùng chung luồng đồng bộ với các yêu cầu thủ công. Sheet chính và nhóm ba tab phụ có kết quả độc lập; PostgreSQL điều phối giữa các instance và đảm bảo chỉ chủ sở hữu hiện tại được ghi.

**Tech Stack:** Node.js `>=24.7 <25`, NestJS 11, `@nestjs/schedule`, Prisma 7, PostgreSQL, `pg`, Jest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-29-dong-bo-excel-hang-ngay-design.md`.

**Trạng thái:** Đã triển khai trên nhánh `codex/sync-google-sheet`. Backend unit test 45/45, typecheck và build PASS. Hai bộ test tích hợp PostgreSQL chưa chạy được ở lần kiểm tra cuối vì kết nối tới database cấu hình trả `ECONNREFUSED`; không dùng schema ứng dụng thật cho fixture có xóa dữ liệu.

## Global Constraints

- Ba liên kết quản lý tương ứng bốn URL CSV: `GOOGLE_SHEET_CSV_URL`, `TWO_TIER_SHEET_CSV_URL`, `VNLIS_SHEET_CSV_URL`, `POPULATION_SHEET_CSV_URL`.
- Đã xác nhận `0 2 * * *`, `Asia/Ho_Chi_Minh`; chạy đúng lịch khi backend hoạt động, không chạy bù sau downtime.
- Với cron, Sheet cập nhật số liệu và đổi nguồn thành `SHEET_SYNC` cho khóa trùng bản ghi `MANUAL`, `CSV_UPLOAD` hoặc `SHEET_SYNC`; thêm bản ghi mới.
- Sau khi xác thực Sheet chính thành công, xóa bản ghi `MANUAL` và `CSV_UPLOAD` không có khóa trong Sheet; giữ `SHEET_SYNC` lịch sử không còn trong Sheet. Thực hiện trong transaction với các lần cập nhật và log thành công.
- Không xóa `SPATIAL_PARCELS`. Bảo toàn tùy chọn `replaceExisting` của thao tác thủ công và hợp đồng API hiện có, trừ trạng thái lỗi cần phản ánh trung thực.
- Bốn nguồn phải có ít nhất một dòng dữ liệu hợp lệ. Nếu một nguồn phụ lỗi, giữ nguyên `SHEET_MODULES_STATE` gần nhất; Sheet chính và nhóm phụ xử lý độc lập.
- Chỉ khi cả hai nhóm thành công mới coi lượt chạy hoàn toàn thành công. Không ghi token hoặc URL chứa thông tin xác thực vào log.
- `SHEET_SYNC_LOCK_DATABASE_URL` phải trùng giao thức, host, cổng, database, tài khoản và schema với `DATABASE_URL`; cả hai dùng PostgreSQL trực tiếp hoặc pooler chế độ session, không dùng transaction pooling.
- Lấy dữ liệu mạng ngoài transaction cơ sở dữ liệu; chặn đồng thời các thao tác ghi Sheet trên mọi instance, kể cả sync thủ công và refresh module công khai.
- Trước khi bật cron production: xác nhận nguồn URL, môi trường chạy liên tục, kết nối PostgreSQL trực tiếp, sao lưu và chạy thử trên môi trường kiểm thử.
- Repo hiện có thay đổi chưa commit. Không hoàn tác hoặc đưa các thay đổi không liên quan vào commit.

**Đã xác nhận:** Chạy lúc 02:00, lấy dữ liệu từ Google Sheet, xóa bản ghi nhập tay/CSV cũ không có trong Sheet. Phạm vi xác nhận xóa không bao gồm `SHEET_SYNC` lịch sử và `SPATIAL_PARCELS`.

---

## Sơ đồ tệp và giao diện

| Tệp | Trách nhiệm |
| --- | --- |
| `apps/be/src/services/sheet-sync-lock.service.ts` | Kết nối PostgreSQL trực tiếp, khóa phiên, cấp và kiểm tra fencing token. |
| `apps/be/src/services/land-dashboard.service.ts` | Tải/kiểm tra bốn CSV, ghi từng nhóm, bảo toàn dữ liệu và ghi log. |
| `apps/be/src/services/sheet-sync-scheduler.service.ts` | Lịch 02:00 và tổng hợp kết quả hai nhóm. |
| `apps/be/src/app.module.ts`, `apps/be/package.json`, `pnpm-lock.yaml` | Đăng ký scheduler và service; cài dependency. |
| `apps/be/prisma/schema.prisma` | Hàng phiên đồng bộ với fencing token tăng đơn điệu; đồng bộ schema theo `prisma:push` của repo. |
| `apps/be/src/services/*.spec.ts` và bài kiểm tra PostgreSQL riêng | Kiểm tra lỗi, đồng thời, giao dịch và lịch. |
| `apps/be/.env.example`, `README.md` | Cấu hình URL, kết nối trực tiếp, quy trình vận hành. |

Giao diện nội bộ cần thống nhất trong quá trình triển khai:

```ts
type SyncOrigin = 'MANUAL' | 'SCHEDULED';
type SyncLease = { token: bigint; isActive: () => boolean };
type GroupResult = { status: 'SUCCESS' | 'FAILED'; recordsSynced: number };
type DailySyncResult = { main: GroupResult; modules: GroupResult; status: 'SUCCESS' | 'FAILED' };

// Khóa được sở hữu cho đến khi callback hoàn tất; trả null khi khóa đang bận.
withSheetSyncLock<T>(work: (lease: SyncLease) => Promise<T>): Promise<T | null>;
// Gọi trong Prisma transaction trước mọi lần ghi dữ liệu Sheet/cache và log thành công.
assertCurrentSheetSyncLease(tx: Prisma.TransactionClient, lease: SyncLease): Promise<void>;
// Một lượt tự động nắm khóa một lần, rồi gọi cả hai nhóm độc lập.
runDailySheetSync(): Promise<DailySyncResult | null>;
```

Không gọi lại `withSheetSyncLock` từ bên trong callback đã nắm khóa. Tách các phương thức công khai có khóa khỏi các phương thức nội bộ nhận `lease`; `syncFromGoogleSheet`, `syncSheetModules`, nhánh `getSheetModules` khi thiếu cache, và `GET /dashboard/sheet-modules?refresh=1` đều phải đi qua cùng cơ chế này. Không khóa các request chỉ đọc cache.

### Task 1: Khóa đồng bộ giữa instance và fencing token

**Files:**
- Modify: `apps/be/prisma/schema.prisma`, `apps/be/src/app.module.ts`, `apps/be/.env.example`.
- Create: `apps/be/src/services/sheet-sync-lock.service.ts`, `apps/be/src/services/sheet-sync-lock.service.spec.ts`.
- Test: `apps/be/src/services/sheet-sync-lock.integration.spec.ts` với PostgreSQL thật, chạy riêng khi có `DATABASE_URL` và `SHEET_SYNC_LOCK_DATABASE_URL`.

**Interfaces:** `withSheetSyncLock<T>` và `assertCurrentSheetSyncLease` như mục giao diện. Token phải được cấp lại mỗi lần lấy khóa; mọi transaction ghi Sheet phải kiểm tra token trước khi ghi.

- [ ] **Bước 1: Viết kiểm thử khóa bằng hai kết nối PostgreSQL thật.** Theo yêu cầu của người dùng, dùng database đã cấu hình (`DATABASE_URL`) với `SHEET_SYNC_LOCK_DATABASE_URL` cùng trỏ đến database/schema. Chạy hai lời gọi `withSheetSyncLock` trên hai instance service khác nhau: giữ callback đầu bằng một promise, xác nhận lời gọi thứ hai trả `null`; thả callback và xác nhận lượt tiếp theo có token lớn hơn. Gọi `assertCurrentSheetSyncLease` với token cũ trong transaction và kiểm tra transaction bị từ chối. Bài test chỉ thêm/cập nhật hàng `sheet_sync_leases`; không đọc hoặc ghi bản ghi dashboard.

```ts
const first = lockA.withSheetSyncLock(async (lease) => {
  entered(lease.token);
  await release;
  return lease.token;
});
const oldToken = await enteredPromise;
expect(await lockB.withSheetSyncLock(async () => true)).toBeNull();
releaseFirst();
await first;
const newToken = await lockB.withSheetSyncLock(async (lease) => lease.token);
expect(newToken! > oldToken).toBe(true);
await expect(prisma.$transaction((tx) =>
  lockB.assertCurrentSheetSyncLease(tx, { token: oldToken }),
)).rejects.toThrow('Sheet sync lease expired');
```

- [ ] **Bước 2: Chạy kiểm thử và xác nhận lỗi do service chưa tồn tại.**

```powershell
pnpm --filter @land/api test -- --runInBand sheet-sync-lock.integration.spec.ts
```

Kết quả mong đợi: lỗi import/service chưa tồn tại. Nếu không có URL database cấu hình, chuẩn bị cấu hình trước; không coi test bị skip là thành công.

- [ ] **Bước 3: Tạo model và đồng bộ schema theo cách repo hiện tại.** Thêm model sau, sinh client bằng `pnpm --filter @land/api prisma:generate`, rồi so sánh schema đích với database đã cấu hình. Chỉ chạy `pnpm --filter @land/api prisma:push` nếu diff chỉ tạo bảng `sheet_sync_leases`; dừng lại nếu có thay đổi nào khác. Repo hiện chưa có thư mục migration và README dùng `prisma:push`; không tạo migration mới vì nó không phải baseline cho các bảng hiện có.

```prisma
model SheetSyncLease {
  id    String @id @db.VarChar(60)
  token BigInt @default(0)

  @@map("sheet_sync_leases")
}
```

- [ ] **Bước 4: Thực hiện khóa có fencing.** Tạo `SheetSyncLockService` và đăng ký provider trong `AppModule`:
  1. Dùng `pg.Client` và biến `SHEET_SYNC_LOCK_DATABASE_URL` trỏ trực tiếp PostgreSQL hoặc pooler ở chế độ session, không dùng transaction pooling. Nếu biến thiếu, cả cron và thao tác ghi Sheet thủ công phải báo lỗi cấu hình; không âm thầm chạy không khóa. Sao chép cách xử lý `sslmode=require`/`uselibpqcompat` trong `apps/be/src/prisma/client.ts`; lấy tham số `schema` trước khi loại khỏi URL và đặt `search_path` bằng `SELECT set_config('search_path', quote_ident($1), false)` trên kết nối. Mặc định schema là `public` nếu không được chỉ định. Khóa và `DATABASE_URL` phải trùng giao thức, host, cổng, database, tài khoản và schema; kiểm tra cấu hình trước khi bật lịch.
  2. Trên kết nối riêng, gọi `SELECT pg_try_advisory_lock(hashtext('land-sheet-sync-v1'), 1) AS acquired`. Dùng overload hai số nguyên của PostgreSQL; overload một tham số nhận `bigint`, trong khi `hashtext` trả `integer`. Nếu `false`, đóng kết nối và trả `null`. Không giữ transaction mở khi tải HTTP.
  3. Sau khi lấy khóa phiên, dùng **transaction trên chính kết nối `pg.Client` đang giữ khóa**: `INSERT` hàng `id='sheet-sync'` nếu thiếu, rồi `UPDATE ... SET token=token+1 ... RETURNING token` và commit. Kết nối mất giữa chừng khiến transaction rollback; không thể cấp token khi không còn giữ khóa. Chỉ callback sở hữu token này mới được ghi. Khóa phiên và `sheet_sync_leases` phải cùng database và schema với Prisma.
  4. `assertCurrentSheetSyncLease` dùng cùng transaction ghi: `SELECT token FROM sheet_sync_leases WHERE id = 'sheet-sync' FOR UPDATE`; nếu token khác hoặc thiếu thì ném `Error('Sheet sync lease expired')`. Giữ row lock đến khi transaction kết thúc. Chủ mới tăng token phải chờ transaction ghi trước đó hoàn tất; callback cũ không thể ghi sau khi token mới được cấp.
  5. Lắng nghe lỗi/mất kết nối `pg`, đánh dấu phiên không còn hiệu lực và không bắt đầu các nhóm mới. Mọi transaction ghi vẫn phải kiểm tra token như trên, kể cả sau khi callback đã bắt đầu. Không lấy khóa phiên qua Prisma pool vì không đảm bảo cùng một kết nối.
  6. Trong `finally`, thử `SELECT pg_advisory_unlock(hashtext('land-sheet-sync-v1'), 1)` trên chính kết nối đã khóa, rồi `client.end()`; nếu kết nối bị mất, PostgreSQL tự giải phóng khóa phiên. Giới hạn thời gian kết nối và ghi lỗi không chứa URL.

SQL cấp token và kiểm tra trong transaction:

```sql
INSERT INTO sheet_sync_leases (id, token) VALUES ('sheet-sync', 0)
ON CONFLICT (id) DO NOTHING;
UPDATE sheet_sync_leases SET token = token + 1
WHERE id = 'sheet-sync' RETURNING token;
SELECT token FROM sheet_sync_leases WHERE id = 'sheet-sync' FOR UPDATE;
```

- [ ] **Bước 5: Kiểm tra mất kết nối.** Trong integration test, giữ một transaction đang xác thực token, đóng kết nối giữ khóa, cho instance mới lấy khóa. Xác nhận chủ mới chỉ nhận token sau khi transaction cũ kết thúc; các transaction mới dùng token cũ bị từ chối. Chạy test task 1, `pnpm --filter @land/api typecheck`; kết quả phải PASS.

- [ ] **Bước 6: Commit riêng thay đổi task 1**, chỉ sau khi kiểm tra danh sách file staged và không bao gồm thay đổi có sẵn của người dùng.

### Task 2: Đồng bộ Sheet chính không làm mất dữ liệu

**Files:**
- Modify: `apps/be/src/services/land-dashboard.service.ts`, `apps/be/src/services/land-dashboard.service.spec.ts`.
- Test: `apps/be/src/services/sheet-sync.integration.spec.ts` dùng schema thử nghiệm tạm trong PostgreSQL đã cấu hình.

**Interfaces:** `syncFromGoogleSheet(dto: SyncSheetDto): Promise<SyncLogDto>` giữ contract HTTP; `syncMainSheet(dto: SyncSheetDto, origin: SyncOrigin, lease: SyncLease): Promise<SyncLogDto>` được gọi khi đã có khóa và trả đủ thông tin log cho luồng thủ công lẫn lịch.

- [ ] **Bước 1: Viết kiểm thử hồi quy với PostgreSQL thật.** Tạo schema thử nghiệm tạm trong cùng database đã cấu hình để không đụng các bảng đang dùng. Tạo bản ghi cùng ngày/xã có nguồn `MANUAL`, `CSV_UPLOAD` và `SHEET_SYNC`; tải CSV fixture và chạy `SCHEDULED` hai lần. Xác nhận dữ liệu lấy theo Sheet, nguồn chuyển thành `SHEET_SYNC` và không sinh bản sao. Bản ghi `MANUAL` và `CSV_UPLOAD` không có trong Sheet bị xóa; lịch sử `SHEET_SYNC` và `SPATIAL_PARCELS` vẫn tồn tại. Xác nhận log phân biệt `SCHEDULED`, rồi xóa đúng schema tạm.

```ts
expect(await prisma.landStatRecord.findUniqueOrThrow({ where: { id: manual.id } }))
  .toMatchObject({ source: 'SHEET_SYNC', bookCount: 12 });
expect(await prisma.landStatRecord.findUniqueOrThrow({ where: { id: sheet.id } }))
  .toMatchObject({ source: 'SHEET_SYNC', bookCount: 12 });
expect(result.status).toBe('SUCCESS');
```

- [ ] **Bước 2: Chạy test và xác nhận thất bại** vì chưa có luồng `SCHEDULED` với khóa và log trong transaction. Bổ sung trường hợp nguồn trả HTTP 500, timeout, CSV rỗng, lỗi giao dịch và log thành công lỗi; mỗi trường hợp phải giữ nguyên dữ liệu trước đó. Mock `fetch` bằng fixture CSV đang dùng trong `sheet-parser.spec.ts`, không gọi nguồn thật.

- [ ] **Bước 3: Thực hiện nhánh scheduled.** Dùng `AbortSignal.timeout(30_000)` cho fetch, kiểm tra `response.ok`, đọc body và `parseSheetCsv` trước transaction; nếu không có dòng hợp lệ thì báo lỗi. Trong transaction gọi `assertCurrentSheetSyncLease`, dùng `upsert` Prisma hiện có theo khóa ngày, loại và xã; cập nhật `bookCount`, `parcelCount`, `source: 'SHEET_SYNC'`, giữ `extraData`/`note` của hàng cũ. Sau khi upsert toàn bộ dòng, xóa các bản ghi còn nguồn `MANUAL` hoặc `CSV_UPLOAD`, trừ `SPATIAL_PARCELS`: bản ghi trùng đã chuyển sang `SHEET_SYNC` nên chỉ bản ghi không có trong Sheet bị xóa. Phần ghi:

```ts
await tx.landStatRecord.upsert({
  where: { reportDate_fieldCode_commune: { reportDate, fieldCode: row.fieldCode, commune: row.commune } },
  update: { bookCount: row.bookCount, parcelCount: row.parcelCount, source: 'SHEET_SYNC' },
  create: { reportDate, fieldCode: row.fieldCode, commune: row.commune,
    bookCount: row.bookCount, parcelCount: row.parcelCount, source: 'SHEET_SYNC' },
});
// Sau khi upsert toàn bộ parsedRows, trong cùng transaction:
await tx.landStatRecord.deleteMany({
  where: { source: { in: ['MANUAL', 'CSV_UPLOAD'] }, fieldCode: { not: 'SPATIAL_PARCELS' } },
});
```

Ghi log `SUCCESS` trong cùng transaction với dữ liệu, `source='SHEET_SYNC'`, `message` ghi rõ `SCHEDULED` và số dòng. Nếu transaction lỗi, rollback; ghi `FAILED` riêng, nếu DB lỗi thì dùng `Logger.error` với thông báo đã loại URL/token. Không ghi thêm log thất bại khi thực tế giao dịch thành công.

- [ ] **Bước 4: Giữ luồng thủ công.** `syncFromGoogleSheet` lấy khóa rồi gọi phương thức nội bộ; tiếp tục tôn trọng `replaceExisting` và không xóa `SPATIAL_PARCELS`. Nếu đang bận, trả HTTP 409 với `Đang có lượt đồng bộ Google Sheet khác`. Giữ `SyncLogDto` và cập nhật unit test hiện có cho constructor/service mới. CSV upload không bị đổi thành cron.

- [ ] **Bước 5: Chạy test và kiểm tra rollback.** Chạy `pnpm --filter @land/api test -- --runInBand land-dashboard.service.spec.ts sheet-sync.integration.spec.ts` và `pnpm --filter @land/api typecheck`. Các test phải PASS; với lỗi DB, kiểm tra trực tiếp dữ liệu trước và sau transaction thay vì chỉ kiểm tra mock.

- [ ] **Bước 6: Commit riêng task 2**, chỉ stage phần thay đổi thuộc task sau khi kiểm tra diff.

### Task 3: Bảo toàn cache cho ba tab phụ

**Files:**
- Modify: `apps/be/src/services/land-dashboard.service.ts`, `apps/be/src/services/land-dashboard.service.spec.ts`; controller giữ lời gọi hiện tại vì khóa nằm ở service dùng chung.

**Interfaces:** `syncSheetModules(opts?): Promise<GoogleSheetModulesDto>` giữ kiểu trả về; tách `syncSheetModulesLocked(opts, origin: SyncOrigin, lease: SyncLease): Promise<GoogleSheetModulesDto>` để cache và tác vụ hằng ngày dùng cùng luồng tải/kiểm tra.

- [ ] **Bước 1: Viết kiểm thử lỗi và cache.** Dùng ba fixture hiện có ở `sheet-parser.spec.ts`; mock một trong ba URL trả HTTP 500, hai URL còn lại hợp lệ; seed `SHEET_MODULES_STATE` với JSON cũ và kiểm tra không có upsert cache. Kiểm tra từng nguồn bằng `it.each`, thêm response rỗng, HTML đăng nhập HTTP 200, CSV sai định dạng, lỗi ghi DB và timeout. Không mock lỗi thành chuỗi rỗng rồi coi là thành công.

```ts
expect(prisma.syncLog.upsert).not.toHaveBeenCalledWith(
  expect.objectContaining({ where: { id: 'SHEET_MODULES_STATE' } }),
);
expect(JSON.parse(existingState.message)).toEqual(previousModules);
expect(group.status).toBe('FAILED');
```

- [ ] **Bước 2: Chạy test và xác nhận thất bại** với cách `fetchSheetCsvSafe` hiện nuốt lỗi và ghi cache rỗng.

- [ ] **Bước 3: Thực hiện tải, kiểm tra và ghi cache.** Thay `fetchSheetCsvSafe` bằng hàm ném lỗi khi HTTP lỗi, timeout hoặc body rỗng. Tải 3 CSV bằng `Promise.all`; parse bằng ba parser hiện có; chỉ chấp nhận mỗi kết quả khi `rows.length > 0`. Quy tắc này cố ý từ chối bảng không có dòng hợp lệ để bảo toàn cache. Trong một Prisma transaction kiểm tra fencing token, `upsert` đúng `id='SHEET_MODULES_STATE'` và ghi log thành công riêng (`source='SHEET_MODULES'`, id tự sinh, message chỉ chứa origin/số dòng). Không ghi trạng thái lỗi đè vào hàng cache. Nếu fetch/parse/DB thất bại, ghi log `FAILED` riêng và trả kết quả lỗi; log fallback qua `Logger` khi DB hỏng.

```ts
const [twoTierCsv, vnlisCsv, populationCsv] = await Promise.all([
  fetchSheetCsv(twoTierUrl), fetchSheetCsv(vnlisUrl), fetchSheetCsv(populationUrl),
]);
const twoTierConversion = parseTwoTierConversionCsv(twoTierCsv);
const vnlisSync = parseVnlisSyncCsv(vnlisCsv);
const populationMatch = parsePopulationMatchCsv(populationCsv);
if (!twoTierConversion.rows.length || !vnlisSync.rows.length || !populationMatch.rows.length) {
  throw new Error('Google Sheet module không có dòng dữ liệu hợp lệ');
}
```

- [ ] **Bước 4: Bảo vệ toàn bộ lối ghi cache.** `syncSheetModules`, refresh qua controller, và fallback `getSheetModules` khi chưa có cache đều lấy cùng khóa. Khi bận, trả HTTP 409; khi nguồn lỗi mà đã có cache, endpoint đọc bình thường vẫn trả cache cũ, còn yêu cầu refresh trả lỗi thay vì báo thành công. Xác nhận `syncFromGoogleSheet` không lấy khóa lồng nhau khi truyền URL module tùy chỉnh.

- [ ] **Bước 5: Chạy test** `pnpm --filter @land/api test -- --runInBand land-dashboard.service.spec.ts` và `pnpm --filter @land/api typecheck`; kiểm tra fixture hiện có và cả trường hợp lỗi phải PASS.

- [ ] **Bước 6: Commit riêng task 3**, không stage thay đổi đang có ngoài task.

### Task 4: Lịch hằng ngày và kết quả từng nhóm

**Files:**
- Modify: `apps/be/package.json`, `pnpm-lock.yaml`, `apps/be/src/app.module.ts`, `apps/be/src/services/land-dashboard.service.ts`.
- Create: `apps/be/src/services/sheet-sync-scheduler.service.ts`, `apps/be/src/services/sheet-sync-scheduler.service.spec.ts`.

**Interfaces:** `runDailySheetSync(): Promise<DailySyncResult | null>` lấy khóa một lần; gọi `syncMainSheet({}, 'SCHEDULED', lease)` và `syncSheetModulesLocked(undefined, 'SCHEDULED', lease)` độc lập. Lỗi nhóm đầu không ngăn thử nhóm sau nếu khóa vẫn hợp lệ.

- [ ] **Bước 1: Viết test điều phối.** Stub `withSheetSyncLock` gọi callback với `{ token: 1n }`, stub nhóm chính thất bại và nhóm phụ thành công, rồi đảo kết quả. Kiểm tra cả hai đều được gọi một lần, tổng trạng thái là `FAILED`; nếu cả hai thành công thì tổng `SUCCESS`; nếu khóa bận thì trả `null` và không gọi nhóm nào.

```ts
expect(result).toMatchObject({
  status: 'FAILED',
  main: { status: 'FAILED' },
  modules: { status: 'SUCCESS' },
});
expect(syncMainSheet).toHaveBeenCalledTimes(1);
expect(syncModulesLocked).toHaveBeenCalledTimes(1);
```

- [ ] **Bước 2: Chạy test, xác nhận lỗi** do scheduler chưa tồn tại. Cài dependency từ root:

```powershell
pnpm --filter @land/api add @nestjs/schedule
```

Kiểm tra phiên bản được giải quyết tương thích NestJS 11 và Node `>=24.7 <25`; commit lockfile cùng dependency. Không dùng package mới khác.

- [ ] **Bước 3: Viết scheduler và đăng ký.** Thêm `ScheduleModule.forRoot()` vào imports và `SheetSyncSchedulerService` vào providers của `AppModule`; dùng `@Cron` sau. Cron không gọi endpoint HTTP và không giữ JWT. `waitForCompletion` chỉ hạn chế chồng lấn trong một instance; khóa Task 1 vẫn bắt buộc.

```ts
@Injectable()
export class SheetSyncSchedulerService {
  private readonly logger = new Logger(SheetSyncSchedulerService.name);
  constructor(private readonly dashboard: LandDashboardService) {}

  @Cron('0 2 * * *', { name: 'daily-sheet-sync', timeZone: 'Asia/Ho_Chi_Minh', waitForCompletion: true })
  async syncDaily(): Promise<void> {
    try {
      const result = await this.dashboard.runDailySheetSync();
      if (!result) this.logger.warn('Bỏ qua: đang có lượt đồng bộ Google Sheet khác');
      else if (result.status === 'FAILED') this.logger.error('Đồng bộ hằng ngày thất bại; xem SyncLog');
      else this.logger.log('Đồng bộ Google Sheet hằng ngày thành công');
    } catch {
      this.logger.error('Không thể chạy đồng bộ Google Sheet hằng ngày');
    }
  }
}
```

Ghi một log kết quả tổng riêng `source='SHEET_DAILY'` với `SUCCESS`/`FAILED`, thời gian và trạng thái từng nhóm; không tính lượt bỏ qua do khóa bận là thành công. Nếu ghi tổng thất bại sau khi dữ liệu đã commit, ghi lỗi logger và không báo toàn bộ thành công. Dùng `Promise` bắt lỗi riêng từng nhóm, không để lỗi nhóm chính làm mất lượt thử nhóm phụ. Không truy cập các URL do client truyền trong cron.

- [ ] **Bước 4: Kiểm tra lịch.** Unit test gọi `syncDaily()` trực tiếp, kiểm tra metadata `@Cron` chứa biểu thức và múi giờ; dùng fake timers hoặc thư viện `cron` kéo theo để xác nhận thời điểm tiếp theo là 02:00 `Asia/Ho_Chi_Minh`, không phụ thuộc múi giờ máy. Không dùng timer lặp để chạy bù khi khởi động.

- [ ] **Bước 5: Chạy các kiểm thử và build.** `pnpm --filter @land/api test -- --runInBand sheet-sync-scheduler.service.spec.ts`, `pnpm --filter @land/api typecheck`, `pnpm --filter @land/api build`; tất cả PASS.

- [ ] **Bước 6: Commit riêng task 4**, chỉ stage file thực hiện.

### Task 5: Vận hành và kiểm thử đầu cuối

**Files:**
- Modify: `README.md`, `apps/be/.env.example`.
- Test: `apps/be/src/services/sheet-sync.integration.spec.ts` và `apps/be/src/services/sheet-sync-lock.integration.spec.ts`.

**Interfaces:** Không bổ sung endpoint hoặc thay đổi giao diện người dùng. Cấu hình server là nguồn cron; link chỉnh trong form quản lý chỉ áp dụng lượt thủ công.

- [ ] **Bước 1: Viết kịch bản tích hợp.** Người dùng yêu cầu dùng PostgreSQL đang cấu hình. Không chạy fixture có thể ghi/xóa bản ghi dashboard trên schema ứng dụng thật. Nếu chạy các kiểm tra dữ liệu tích hợp, tạo một schema thử nghiệm tạm trong cùng database, đồng bộ Prisma schema vào schema đó rồi xóa đúng schema tạm sau kiểm tra; nếu không đủ quyền, ghi rõ phần này chưa chạy. Fixture kiểm tra hai lượt chạy ngày liên tiếp, cập nhật/xóa đúng bản ghi, cache đủ ba báo cáo, contention giữa hai instance với cron/thủ công/refresh, rollback khi ghi log thành công lỗi và giữ cache cũ khi update lỗi. Test fixture cần chạy trên schema tạm; ở lần chạy cuối PostgreSQL trả `ECONNREFUSED`, nên chưa xác nhận các nhánh này bằng database thật.

- [ ] **Bước 2: Chạy kịch bản lỗi.** Unit test bao phủ nguồn sai định dạng, dòng dữ liệu 0/0, lỗi ghi log thành công cần rollback, lỗi metadata, contention và fencing token cũ. Integration test bổ sung rollback nhóm chính, giữ cache phụ khi ghi lỗi, hai lượt lặp và tranh chấp thật giữa hai kết nối. Kiểm tra tích hợp chưa chạy được do `ECONNREFUSED`; không tính suite bị skip là PASS.

- [ ] **Bước 3: Ghi cấu hình vận hành.** Trong `.env.example`, thêm `SHEET_SYNC_LOCK_DATABASE_URL` với cùng ví dụ PostgreSQL cục bộ, không chứa credential thật; bổ sung ví dụ cho các biến URL còn thiếu. Trong `README.md`, ghi: lịch 02:00 Việt Nam; yêu cầu PostgreSQL direct/session pooling và backend chạy liên tục; không tự chạy bù; cách xem log `SHEET_DAILY`/`SHEET_SYNC`/`SHEET_MODULES`; cách chạy lại bằng trang quản lý; URL form không lưu cấu hình cron; sao lưu và thử trước khi bật.

- [ ] **Bước 4: Chạy bộ kiểm tra.**

```powershell
pnpm --filter @land/api test -- --runInBand
pnpm --filter @land/api typecheck
pnpm --filter @land/api build
```

Chạy bài test khóa bằng `DATABASE_URL` và `SHEET_SYNC_LOCK_DATABASE_URL` theo yêu cầu người dùng; bài này chỉ đổi token trong bảng khóa. Chạy riêng test dữ liệu tích hợp trên schema thử nghiệm tạm trong cùng database nếu quyền cho phép. Lần chạy cuối trả `ECONNREFUSED`; backend unit test đạt 45/45, còn hai suite tích hợp chưa chạy. Test bị skip không chứng minh khóa hoặc rollback hoạt động.

- [ ] **Bước 5: Kiểm tra diff và commit tài liệu vận hành.** Không stage các thay đổi có trước của người dùng. Không bật hoặc triển khai cron chỉ vì test đã PASS; xác nhận các quyết định ở đầu kế hoạch trước khi bật.

## Tự kiểm tra độ bao phủ

- Bốn nguồn và giờ/múi giờ: Task 3–4. Cập nhật thủ công và các lối refresh: Task 2–3. Bảo toàn dữ liệu và log: Task 2–3. Chống đồng thời, fencing, phục hồi lỗi: Task 1 và 5. Vận hành và xác nhận môi trường: Task 5.
- Phạm vi xóa chỉ gồm bản ghi nhập tay/CSV vắng mặt; nguồn Sheet lịch sử và `SPATIAL_PARCELS` được giữ.
- Không phát triển xử lý `.xlsx`, hệ thống hàng đợi, giao diện quản trị lịch, retry tự động hoặc chạy bù vì spec không yêu cầu.
