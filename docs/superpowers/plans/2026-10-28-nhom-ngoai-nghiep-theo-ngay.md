# Nhóm ngoại nghiệp theo ngày — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to execute task-by-task. Steps use checkboxes.

**Goal:** Người xem mục 5 thấy bảng GCN và hộp theo từng ngày, mặc định 7 ngày gần nhất và có thể chọn khoảng ngày, chi nhánh.

**Architecture:** Mở rộng đường truyền báo cáo ngoài hiện có cho một ngày; giao diện truy vấn từng ngày tuần tự, trình bày kết quả ngay khi từng ngày xong và hủy chuỗi cũ khi đổi bộ lọc. Backend giữ token, kiểm tra ngày ở DTO tại trust boundary và chuyển tiếp theo GET đã xác minh. Không tạo module hay thư viện mới.

**Tech Stack:** React, TanStack Query, @internationalized/date, NestJS, class-validator, Jest, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-28-nhom-ngoai-nghiep-theo-ngay-design.md`.

## Primary goal

Người xem đối chiếu được GCN và hộp theo ngày và theo chi nhánh, với ngày lỗi được nhận biết rõ ràng.

## Global Constraints

- Mặc định 7 ngày gần nhất, gồm hôm nay theo `Asia/Ho_Chi_Minh`; mỗi dòng là một ngày.
- Chỉ hiển thị GCN và hộp; không cộng các dòng hoặc gọi số liệu là phát sinh khi chưa xác nhận ngữ nghĩa.
- Giữ chi nhánh và tương thích đường gọi cũ không truyền ngày; không thay đổi các nhóm khác.
- Token chỉ ở cấu hình backend; không đưa token vào tài liệu, mã frontend, log, test fixture hay URL.
- GET query cho ngày/branch đã được xác minh; POST form trả 405. Các ngày 25–27/10 trả số khác nhau, ngày 01/01/2020 trả 0. Ngữ nghĩa phát sinh/lũy kế và giới hạn nguồn chưa có tài liệu. Giới hạn giao diện 31 ngày và truy vấn tuần tự để kiểm soát lượng gọi; không cộng kết quả.
- Hủy truy vấn ngày/chi nhánh cũ khi bộ lọc đổi; không tiếp tục các ngày đang xếp hàng. Một request đã gửi có thể hoàn tất ở nguồn sau khi browser ngắt kết nối; nếu giới hạn nguồn yêu cầu hủy upstream tuyệt đối, cần truyền disconnect từ controller xuống `fetch`.
- Không commit, triển khai hoặc thay đổi dữ liệu thật nếu chưa được yêu cầu.

## File map

- `apps/be/src/dtos/land.dto.ts`: khai báo tham số ngày tùy chọn cho proxy.
- `apps/be/src/controllers/dashboard.controller.ts`: chuyển ngày tới hàm hiện có.
- `apps/be/src/services/land-dashboard.service.ts`: đổi ngày đã được DTO kiểm tra sang định dạng nguồn, gọi API; giữ fallback hiện tại.
- `apps/be/src/services/land-dashboard.service.spec.ts`: kiểm thử gọi nguồn và fallback.
- `apps/web/src/api/index.ts`: gửi ngày tùy chọn và AbortSignal đến proxy.
- `apps/web/src/pages/public/DashboardPage.tsx`: khoảng ngày riêng, các truy vấn và bảng.
- `apps/web/vite.config.ts`: giữ thứ tự thực thi module cho cấu hình chia vendor chunk hiện tại; production preview trước đó trắng do lỗi runtime.
- `packages/shared/src/index.ts`: chỉ sửa nếu kết quả xác minh yêu cầu thêm thông tin phản hồi; ngày của dòng có thể dùng ngày yêu cầu.

## Phase 0: Documentation Discovery và xác minh nguồn ngoài

**How this serves the primary goal:** Chỉ lập bảng khi biết mỗi yêu cầu thực sự trả dữ liệu nào và cách gọi an toàn.

**Allowed APIs và nguồn:**

- Proxy hiện tại `GET /dashboard/external-report`, `getExternalReport(branch?: string)` và fallback: `apps/be/src/controllers/dashboard.controller.ts:28`, `apps/be/src/services/land-dashboard.service.ts:637`.
- DTO chịu `ValidationPipe` với `whitelist` và `forbidNonWhitelisted`: `apps/be/src/dtos/land.dto.ts:58`, `apps/be/src/config/app.ts:42`.
- `fetchExternalReport(branch?: string, date?: string, signal?: AbortSignal)`: `apps/web/src/api/index.ts:48`. `useQuery` và mẫu `DeferredDatePicker`: `apps/web/src/pages/public/DashboardPage.tsx:107,579`; props tại `apps/web/src/components/ui/deferred-date-picker.tsx:7`.
- [TanStack/query: query keys](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/query-keys.md): đưa biến của truy vấn vào key để dữ liệu được cache đúng. Dự án đã dùng thư viện này.
- [curl/curl: data-urlencode](https://github.com/curl/curl/blob/master/docs/cmdline-opts/data-urlencode.md): tùy chọn trong ví dụ là dữ liệu POST; không chứng minh GET có tham số ngày.

- [x] Đọc spec, các vị trí trên và các đoạn gọi thực tế. DTO dùng chung giữ nguyên vì ngày của dòng lấy từ ngày yêu cầu; callers hiện có chỉ có dashboard và test.
- [x] Dùng token đã cấu hình mà không in token. GET query có ngày trả HTTP 200 và echo ngày; POST form trả HTTP 405. GET có branch UTF-8 trả HTTP 200 và echo branch.
- [x] So sánh 25, 26, 27/10/2026 và 01/01/2020: ba ngày có tổng khác nhau, ngày cũ trả 0. Dữ liệu live không tự xác nhận ngữ nghĩa phát sinh/lũy kế; giao diện chỉ gắn nhãn ngày lọc và không cộng dòng. Múi giờ mặc định dùng Asia/Ho_Chi_Minh.
- [x] Không tìm thấy giới hạn/rate limit được ghi nhận. Quyết định áp giới hạn giao diện 31 ngày và gửi tuần tự để tránh burst; nếu nguồn có giới hạn thấp hơn, request sẽ báo lỗi từng ngày.
- [x] Ghi kết quả đã che token vào spec. GET query là phương thức cho yêu cầu có ngày và yêu cầu cũ.

**Verification:** GET ngày/branch được xác nhận; ngày trống trả 0. Ngữ nghĩa phát sinh/lũy kế và upstream rate limit vẫn chưa rõ.
**Anti-pattern:** Không coi HTTP 200 hoặc hai số trùng nhau là xác nhận ngữ nghĩa; không thử tải lớn để dò giới hạn.

## Phase 1: Proxy một ngày

**How this serves the primary goal:** Mỗi dòng cần đúng dữ liệu ngày và chi nhánh, không lộ token.

**Documentation references:** DTO `land.dto.ts:58`; `app.ts:42`; `dashboard.controller.ts:28`; service `land-dashboard.service.ts:637`; kiểm thử mẫu `land-dashboard.service.spec.ts:349-393`.

**Interfaces:** Bổ sung `date?: string` dạng `YYYY-MM-DD` vào `ExternalReportQueryDto` và `getExternalReport(branch?: string, date?: string): Promise<ExternalChuanHoaReportDto>`. Ngày là tùy chọn; `ValidationPipe` kiểm tra định dạng ISO và ngày lịch.

- [x] Theo mẫu `jest.spyOn(global, 'fetch')`, viết kiểm thử truyền `2026-10-26` cùng branch và xác thực `date_from=26/10/2026`, `date_to=26/10/2026`; thêm test DTO từ chối `2026-02-30`.
- [x] RED: test dịch vụ nhận URL thiếu `date_from`; DTO chấp nhận ngày lịch không hợp lệ.
- [x] DTO dùng `@IsOptional()`, `@IsDateString({ strict: true })`, `@Matches(/^\d{4}-\d{2}-\d{2}$/)`; controller chuyển `query.branch, query.date`; service đổi sang `DD/MM/YYYY` mà không dùng múi giờ hệ thống.
- [x] Dùng `URLSearchParams`, giữ header Bearer và fallback; trường hợp không ngày vẫn gọi URL không query.
- [x] `pnpm --filter @land/api test -- --runInBand`: 3 suites, 20 tests passed; giữ test branch UTF-8, lỗi nguồn và caller cũ.

**Verification:** Test kiểm body/query, method, ngày lịch, lỗi và tương thích; không log token.
**Anti-pattern:** Không chỉ dựa vào regex để xác thực ngày; không gửi token cho browser; không thay đổi HTTP method cũ nếu không có ngày.

## Phase 2: Bảng theo ngày

**How this serves the primary goal:** Người xem đổi khoảng ngày và thấy trạng thái riêng của từng ngày.

**Documentation references:** `DashboardPage.tsx:63-110,579-596,764-858,1251-1347`; `api/index.ts:48`; `deferred-date-picker.tsx:7-14`; [TanStack/query query keys](https://github.com/TanStack/query/blob/main/docs/framework/react/guides/query-keys.md).

**Interfaces:** `fetchExternalReport(branch?: string, date?: string, signal?: AbortSignal): Promise<ExternalChuanHoaReportDto>` gửi `{ branch, date }` khi có và truyền tín hiệu hủy xuống Axios. Một query cho khoảng ngày có key `['external-report', branch, fromDate, toDate]`; mỗi GET con gửi một ngày `YYYY-MM-DD`.

- [x] Thêm self-check Node cho 7 ngày theo giờ Việt Nam, qua ngày nhuận, khoảng ngược và giới hạn 31 ngày.
- [x] RED→GREEN: check chứng minh ngày cuối `2026-10-26` và đầu `2026-10-20` tại `2026-10-25T17:00:00Z`; kiểm tra ngày nhuận và khoảng không hợp lệ.
- [x] Dùng hai `DeferredDatePicker` và bảng có cột `Ngày`, `Tổng GCN`, `Tổng hộp`; query key chứa branch và khoảng, gọi tuần tự tối đa 31 ngày, cập nhật cache sau từng ngày và truyền AbortSignal để dừng chuỗi cũ.
- [x] Khoảng ngược/quá 31 ngày có cảnh báo và không gửi yêu cầu. Mỗi dòng hiện tải/lỗi riêng; fallback `available === false` không hiện số 0. Không giữ dữ liệu placeholder từ khoảng hoặc branch khác.
- [x] Giữ bộ lọc chi nhánh và nút làm mới; giữ biểu đồ files/folders hiện đang ẩn.
- [x] Chạy check ngày, `pnpm --filter @land/web typecheck` và `pnpm --filter @land/web build`; bản dev hiển thị đủ 7 ngày, số GCN/hộp, trạng thái tải, lỗi riêng; mỗi dòng cập nhật ngay khi request tuần tự của ngày đó xong; các mục khác vẫn render.

**Verification:** 7 ngày đúng giờ Việt Nam; đổi ngày/branch đổi dữ liệu; lỗi từng dòng không ẩn thành 0; trạng thái tải không hiện số cũ.
**Anti-pattern:** Không tái sử dụng bộ lọc ngày chung đang bị ẩn; không `keepPreviousData` mà không phân biệt dữ liệu cũ; không tính tổng các dòng.

## Phase 3: Verification

**How this serves the primary goal:** Chứng minh bảng hoạt động đúng mà không làm sai dữ liệu hoặc ảnh hưởng dashboard còn lại.

- [x] Chạy kiểm tra tuần tự theo gói: API test (3 suites/20 tests), typecheck và build; web self-check (3 tests), typecheck và build. Các script root song song bị `spawn EPERM` trong môi trường này.
- [x] Kiểm tra thủ công: mặc định 7 ngày có số liệu thật; loading từng dòng và lỗi riêng; lọc chi nhánh; làm mới; mục khác vẫn render. Đổi khoảng trên UI: khoảng ngược hiện cảnh báo, khoảng một ngày hiển thị đúng dòng; lượt cuối dùng preview không có proxy nên trả 502. Helper cũng kiểm thử khoảng hợp lệ/không hợp lệ.
- [x] Đối chiếu một dòng: ngày 26/10/2026 trả 2.971 GCN, 7 hộp qua proxy và khớp kết quả API cùng ngày; GET có branch đã được xác minh từ Phase 0. Không hiển thị hoặc ghi token.
- [x] Rà soát token trong source/spec/plan mới và diff; không thêm external report token vào frontend. Kiểm tra `git diff --check`.
- [x] Build production và mở preview: sau khi bật `strictExecutionOrder` cho cấu hình vendor chunk, trang mount đủ mục 5 và không có lỗi runtime mới. Tham khảo [Rolldown code splitting](https://rolldown.rs/reference/OutputOptions.codeSplitting), tài liệu cảnh báo manual splitting có thể đổi thứ tự side effect và mô tả giữ execution order.
- [x] Báo kết quả đã chạy, những kiểm tra chưa chạy và giới hạn còn lại; không khẳng định ý nghĩa dữ liệu ngoài bằng chứng nguồn.

**Verification:** Các lệnh thành công, các trường hợp thủ công có kết quả ghi nhận, diff không chứa bí mật.
**Anti-pattern:** Không coi build thành công là bằng chứng API thật hoặc số liệu đúng ngữ nghĩa.
