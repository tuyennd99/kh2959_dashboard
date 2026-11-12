# Dự thảo thiết kế: đồng bộ dữ liệu bảng tính hằng ngày

> Cập nhật 12/11/2026: lịch chuyển sang mỗi 5 phút; các mốc 02:00 bên dưới ghi lại thiết kế ban đầu.

Ngày: 29/10/2026

Trạng thái: đã xác nhận sử dụng ba liên kết Google Sheet hiện có, chạy 02:00 và xóa bản ghi nhập tay/CSV cũ không có trong Sheet. Đã triển khai trên nhánh `codex/sync-google-sheet`.

## Mục tiêu và nguồn dữ liệu

Tự động đọc ba liên kết Google Sheet đã có trên trang quản lý một lần mỗi ngày và cập nhật dashboard. Backend lấy nội dung dưới dạng CSV:

1. Dữ liệu bóc tách từ công cụ: `GOOGLE_SHEET_CSV_URL`.
2. Quy đổi tờ thửa từ ba cấp sang hai cấp: `TWO_TIER_SHEET_CSV_URL`.
3. Trích xuất, ký số, đồng bộ VNLIS và đối khớp dân cư: hai tab trong cùng tệp Google Sheet, tương ứng `VNLIS_SHEET_CSV_URL` và `POPULATION_SHEET_CSV_URL`.

Như vậy có ba liên kết người dùng quản lý và bốn URL xuất CSV. Các URL server cấu hình là nguồn cho lịch tự động; việc sửa URL trong form hiện chỉ áp dụng cho lần đồng bộ thủ công, không tự lưu lại cấu hình server.

## Hiện trạng

- Backend NestJS dùng PostgreSQL và Prisma; chưa có bộ lập lịch trong dependencies hoặc cấu hình cron triển khai trong repo.
- `POST /api/manage/sync-sheet` gọi `LandDashboardService.syncFromGoogleSheet`; URL mặc định lấy từ `GOOGLE_SHEET_CSV_URL`. CSV được nhóm theo ngày, loại dữ liệu và xã, sau đó lưu vào `LandStatRecord`.
- Bảng có khóa duy nhất theo ngày, loại dữ liệu và xã. Hiện đồng bộ có thể ghi đè bản ghi nhập tay hoặc CSV khi trùng khóa, ngay cả khi `replaceExisting` là `false`. Khi `replaceExisting` là `true`, các bản ghi nguồn Sheet cũ bị xóa, trừ `SPATIAL_PARCELS`.
- Ba bảng bổ sung gồm chuyển đổi hai cấp, VNLIS và PC06 có luồng `syncSheetModules` riêng. Gọi `syncFromGoogleSheet({})` không tự cập nhật ba bảng này. Khi tải bảng phụ lỗi, luồng hiện tại có thể ghi trạng thái thành công và thay cache tốt bằng dữ liệu rỗng.
- `SyncLog` đã lưu lịch sử đồng bộ, nhưng lỗi phân tích hoặc ghi cơ sở dữ liệu chưa luôn được ghi nhận; log thành công của bảng chính được ghi sau giao dịch dữ liệu.

## Các phương án lập lịch

1. **Khuyến nghị: lịch trong backend NestJS.** Dùng `@nestjs/schedule`, gọi lại dịch vụ đồng bộ hiện có và đặt múi giờ `Asia/Ho_Chi_Minh`. Phù hợp khi backend chạy liên tục; cần bổ sung dependency và cơ chế tránh chạy đồng thời giữa các instance.
2. **Cron ngoài ứng dụng.** Bộ lập lịch của máy chủ hoặc nền tảng chạy một lệnh đồng bộ riêng mỗi ngày. Không cần lịch trong backend, nhưng phải cấu hình, giám sát và bảo vệ lệnh ở môi trường triển khai; repo chưa cho biết nền tảng đang dùng.
3. **Scheduler Node độc lập.** Dùng `node-cron` trực tiếp. Có thể chạy trong tiến trình backend, nhưng không có lợi thế rõ ràng so với tích hợp NestJS cho dự án này.

## Hành vi đề xuất

- Chạy một lần mỗi ngày lúc **02:00**, múi giờ `Asia/Ho_Chi_Minh`, theo xác nhận của người dùng. Không tự chạy bù khi backend ngừng hoạt động vào giờ đã định. Cho phép cán bộ tiếp tục đồng bộ Google Sheet thủ công.
- Đồng bộ cả ba liên kết theo cấu hình máy chủ. Liên kết thứ ba gồm hai tab, nên lượt chạy cần xử lý đủ bốn nguồn CSV. Gọi riêng luồng Sheet chính và luồng ba bảng phụ; không giả định `syncFromGoogleSheet({})` tự chạy bảng phụ.
- Tải và kiểm tra dữ liệu trước khi thay đổi cơ sở dữ liệu. Nếu tải lỗi, quá thời gian chờ, định dạng sai hoặc không có dòng hợp lệ, ghi thất bại và giữ dữ liệu đang có. Không in thông tin xác thực vào log.
- Google Sheet là nguồn cho lượt đồng bộ tự động. Với khóa trùng bản ghi `MANUAL` hoặc `CSV_UPLOAD`, cập nhật số liệu theo Sheet và chuyển nguồn bản ghi thành `SHEET_SYNC`; thêm dữ liệu mới và cập nhật bản ghi Sheet cũ. Không thêm chức năng nhập tay; người dùng cho biết giao diện nhập tay đã được ẩn.
- Sau khi Sheet chính được tải và kiểm tra thành công, xóa bản ghi nguồn `MANUAL` hoặc `CSV_UPLOAD` không có khóa tương ứng trong Sheet. Chỉ xóa trong transaction ghi dữ liệu và log; nguồn lỗi hoặc không có dòng hợp lệ không được xóa. Giữ bản ghi `SHEET_SYNC` lịch sử không còn trong Sheet và `SPATIAL_PARCELS`; câu hỏi đã xác nhận chỉ đề cập dữ liệu nhập tay/CSV cũ.
- Trong cùng một giao dịch, áp dụng thay đổi và ghi `SyncLog` thành công. Khi lỗi, rollback thay đổi và cố gắng ghi log thất bại riêng; nếu cơ sở dữ liệu không khả dụng, ghi lỗi qua logger backend. Log phân biệt lượt tự động và thủ công, ghi thời điểm, trạng thái và số dòng xử lý.
- Ngăn đồng bộ tự động chồng lấn với lần tự động hoặc thủ công khác. Với nhiều instance, dùng khóa PostgreSQL dùng chung cho toàn bộ đường ghi Sheet, không dựa riêng vào khóa trong bộ nhớ. Khóa phải được giữ và giải phóng an toàn trong suốt lượt chạy, kể cả khi lỗi; thiết kế chi tiết phải xét kết nối Prisma và không giữ transaction mở trong lúc chờ tải mạng.
- Ghi rõ kết quả Sheet chính và nhóm ba bảng phụ. Các nguồn phụ được tải và kiểm tra trước khi thay cache chung: nếu bất kỳ nguồn phụ nào thất bại, giữ nguyên toàn bộ cache phụ gần nhất và ghi nhóm phụ thất bại. Sheet chính và nhóm phụ xử lý độc lập; một nhóm thất bại không xóa hay hoàn tác kết quả thành công của nhóm kia. Lượt chạy chỉ thành công toàn bộ khi cả hai nhóm thành công.

## Kiểm thử và vận hành

- Kiểm tra lịch, múi giờ và việc gọi service đúng một lần; kiểm tra lịch không chạy bù sau downtime.
- Kiểm tra thêm mới, cập nhật bản ghi Sheet và ghi đè số liệu bản ghi nhập tay/CSV trùng khóa; xóa bản ghi nhập tay/CSV không có trong Sheet; bảo toàn `SHEET_SYNC` lịch sử và `SPATIAL_PARCELS`; chạy lặp không tạo bản ghi trùng.
- Kiểm tra nguồn lỗi, timeout, CSV rỗng hoặc sai định dạng, lỗi ghi DB và rollback; kiểm tra log thành công và thất bại phản ánh đúng kết quả.
- Kiểm tra cả bốn nguồn CSV được gọi; khi một trong ba nguồn phụ thất bại, cache phụ cũ được giữ và kết quả phản ánh lỗi, kể cả khi Sheet chính thành công.
- Kiểm tra hai instance và đồng bộ thủ công chạy đồng thời chỉ có một lượt ghi; kiểm tra khóa được giải phóng sau lỗi.
- Xác nhận môi trường chạy backend liên tục, cấu hình URL hợp lệ và theo dõi lượt chạy thất bại. Trước khi bật tự động, sao lưu dữ liệu hiện có và thử trên môi trường kiểm thử.

## Phạm vi mã dự kiến

- `apps/be/package.json`, `apps/be/src/app.module.ts`: bổ sung và đăng ký scheduler.
- Một service lập lịch tại `apps/be/src/services/`: điều phối lịch và gọi luồng đồng bộ.
- `apps/be/src/services/land-dashboard.service.ts` và kiểm thử tương ứng: ưu tiên số liệu Sheet, giao dịch, log lỗi, phối hợp chạy đồng thời và bảo toàn cache khi nguồn phụ lỗi.
- `apps/be/src/config/env.ts`, `apps/be/.env.example` và tài liệu vận hành: chỉ bổ sung cấu hình thật sự cần sau khi xác nhận cách triển khai.

## Vận hành đã xác nhận

Chọn lịch trong NestJS. Backend phải chạy liên tục để thực hiện lịch; không chạy bù nếu backend ngừng lúc 02:00.

## Nguồn tham khảo

- [nestjs/schedule](https://github.com/nestjs/schedule/blob/6.1.3/lib/decorators/cron.decorator.ts): decorator hỗ trợ múi giờ và `waitForCompletion`; dùng để lập lịch trong NestJS. Tùy chọn này không tự khóa giữa nhiều instance.
- [Tài liệu khóa của NestJS](https://github.com/nestjs/docs.nestjs.com/blob/master/content/reliability/locks.md): mô tả vấn đề khóa giữa các instance; dự án đã có PostgreSQL nên ưu tiên xem xét cơ chế có sẵn thay vì thêm hạ tầng.
- [postgres/postgres](https://github.com/postgres/postgres/blob/master/src/backend/utils/adt/lockfuncs.c): xác nhận `pg_try_advisory_lock(int4, int4)` là khóa độc quyền không chờ; dùng để điều phối các instance bằng chính PostgreSQL hiện có.
- [node-cron/node-cron](https://github.com/node-cron/node-cron): hỗ trợ cron và tránh chồng lấn; đã so sánh nhưng ưu tiên tích hợp NestJS ở trên.
