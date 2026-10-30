# Thiết kế dự thảo: dữ liệu theo ngày cho nhóm ngoại nghiệp

Ngày: 28/10/2026
Trạng thái: đã triển khai; phương thức API và bản production preview đã xác minh.

## Mục tiêu

Mục 5 hiển thị bảng báo cáo chuẩn hóa gồm nhiều ngày, mỗi ngày một dòng, đồng thời giữ bộ lọc chi nhánh hiện có. Không thay đổi các nhóm khác.

## Hiện trạng

- `DashboardPage.tsx` truy vấn báo cáo ngoài theo chi nhánh; bộ lọc ngày của dashboard chưa áp dụng cho mục 5.
- Backend chuyển tiếp qua `GET /api/dashboard/external-report`, giữ token trong cấu hình server và cung cấp trạng thái không khả dụng khi nguồn ngoài lỗi.
- Mục 5 hiện hiển thị tổng GCN và tổng hộp. Các biểu đồ files/folders đang bị ẩn; phạm vi này không tự bật lại chúng.
- Dữ liệu mẫu trả một kết quả tổng hợp cho `date_from` và `date_to`; không có danh sách kết quả cho từng ngày. Chưa xác định số liệu là phát sinh trong kỳ hay lũy kế.

## Hướng đề xuất

Hiển thị bảng có cột ngày, tổng GCN và tổng hộp, tương ứng các chỉ số đang hiển thị. Cho phép chọn khoảng ngày riêng tại mục 5. Với mỗi ngày, gửi cùng ngày đó ở cả `date_from` và `date_to`, kết hợp chi nhánh đang chọn. Mặc định hiển thị 7 ngày gần nhất, tính cả ngày hiện tại theo múi giờ Việt Nam. Không cộng các dòng hoặc khẳng định đây là số phát sinh cho đến khi xác minh ý nghĩa dữ liệu.

1. Giao diện dùng bộ chọn ngày có sẵn của dự án; bổ sung khoảng ngày và chi nhánh vào khóa truy vấn để không nhầm dữ liệu giữa các lựa chọn.
2. Backend kiểm tra ngày hợp lệ, chuyển đổi sang `DD/MM/YYYY`, chuyển tiếp cùng chi nhánh và giữ token ở server. Không đưa token vào mã frontend hoặc tài liệu.
3. Mỗi dòng thể hiện ngày tương ứng với số liệu và cập nhật sau khi request ngày đó hoàn tất. Khi tải hoặc một ngày lỗi, thể hiện trạng thái rõ ràng; không trình bày số cũ hoặc số 0 dự phòng như kết quả thành công. Giới hạn lựa chọn là 31 ngày, gửi tuần tự và hủy các ngày còn xếp hàng khi đổi bộ lọc; một request đã tới backend có thể vẫn hoàn tất ở nguồn ngoài. API nguồn chưa công bố giới hạn.
4. Giữ hợp đồng hiện có cho các bên gọi không truyền ngày; chỉ mở rộng kiểu dữ liệu và tham số khi cần.

## Xác minh trước khi triển khai

- Người dùng đã chọn xem nhiều ngày, dạng bảng là hướng tối giản và mặc định 7 ngày gần nhất. Ngữ nghĩa số liệu phát sinh/lũy kế vẫn chưa được API tài liệu hóa; giao diện không cộng dòng hoặc gắn nhãn phát sinh.
- Đã kiểm tra nguồn ngày 28/10/2026: GET query trả HTTP 200 và echo `date_from`, `date_to`, `branch`; POST form trả HTTP 405. Dùng GET query theo cách gọi hiện có. Thử ngày 25, 26, 27/10 cho tổng khác nhau; 01/01/2020 trả 0. Điều này xác nhận bộ lọc ngày tác động tới kết quả, nhưng chưa xác định số liệu là phát sinh hay lũy kế. Các số ngày 26/10 hiện tại khác mẫu đã gửi trước đó; nguồn trả báo cáo mới tại thời điểm gọi.
- API không có tài liệu giới hạn hoặc ngữ nghĩa thời gian trong tài liệu repo. Mỗi ngày được truy vấn độc lập, không cộng kết quả; ngày 01/01/2020 trả số 0. Dùng tối đa 31 ngày mỗi lượt chọn để tránh gửi lượng truy vấn lớn; truy vấn tuần tự để không tạo burst tới nguồn.
- Kiểm thử ngày hợp lệ và không hợp lệ, thay đổi ngày/chi nhánh, mã hóa chi nhánh tiếng Việt, tải và lỗi nguồn ngoài; xác nhận các nhóm khác không đổi.

## Phạm vi mã dự kiến

- `apps/web/src/pages/public/DashboardPage.tsx`, `apps/web/src/api/index.ts`.
- `apps/be/src/dtos/land.dto.ts`, `apps/be/src/controllers/dashboard.controller.ts`, `apps/be/src/services/land-dashboard.service.ts` và kiểm thử liên quan.
- `packages/shared/src/index.ts` nếu cần bổ sung thông tin ngày vào kiểu phản hồi.

## Tham khảo

- [TanStack Query](https://github.com/TanStack/query): quản lý truy vấn theo khóa; phù hợp vì dự án đã dùng thư viện này. Giữ các tham số ảnh hưởng kết quả trong khóa truy vấn.
- Cấu trúc proxy và xử lý lỗi đã có trong dự án là lựa chọn chính; không thêm thư viện hoặc module trừ khi xác minh cho thấy cần thiết.
- [Rolldown output code splitting](https://rolldown.rs/reference/OutputOptions.codeSplitting): manual splitting có thể ảnh hưởng thứ tự side effect; dùng `strictExecutionOrder` để giữ thứ tự module khi giữ cấu hình vendor chunks hiện có.
