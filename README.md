# Dashboard Dữ Liệu Đất Đai (`D:\project\dashboarddatdai`)

Hệ thống Dashboard theo dõi tiến độ chuẩn hóa hồ sơ đất đai và thống kê số sổ / số thửa hằng ngày, kế thừa base monorepo từ `chamdiemocop`.

## Cấu trúc Monorepo

- `apps/web`: React 19 + Vite 8 + TanStack Router & Query + Tailwind CSS v4.
  - `/` (Công khai): Hiển thị tiến độ chuẩn hóa từ API `chuanhoa.minhhuub.org` (lọc theo chi nhánh VPĐKĐĐ) + Thống kê 3 trường đất đai (`Sai Lệch Thông Tin CSH`, `GCN Ngoài Danh Sách`, `Số lượng tờ bản đồ đã chuẩn hóa` và các trường mở rộng), biểu đồ theo ngày/hạng mục/xã và bảng dữ liệu.
  - `/login`, `/manage` (Dành cho cán bộ nhập liệu): Đồng bộ 1 chạm từ Google Sheet, nhập liệu thủ công bằng form, tải file CSV và thêm trường dữ liệu mở rộng.
- `apps/be`: NestJS 11 + Prisma 7 + PostgreSQL (`/api`).
- `packages/shared`: Các kiểu dữ liệu dùng chung giữa FE và BE.

## Khởi chạy nhanh

```bash
# 1. Cài đặt dependencies
pnpm install

# 2. Sinh Prisma Client, đẩy schema & chạy seed (tạo tài khoản admin + đồng bộ dữ liệu mẫu từ Google Sheet)
pnpm --filter @land/api prisma:generate
pnpm --filter @land/api prisma:push
pnpm --filter @land/api prisma:seed

# 3. Chạy đồng thời Backend (port 3045) & Frontend (port 5185)
pnpm dev
```

## Tài khoản quản trị mặc định

- **Email:** `admin@datdai.local`
- **Mật khẩu:** `Admin@123456`

## Đồng bộ Google Sheet hằng ngày

Backend tự đồng bộ lúc **02:00**, múi giờ `Asia/Ho_Chi_Minh`, khi tiến trình backend đang chạy. Lịch dùng bốn URL CSV cấu hình ở backend: `GOOGLE_SHEET_CSV_URL`, `TWO_TIER_SHEET_CSV_URL`, `VNLIS_SHEET_CSV_URL` và `POPULATION_SHEET_CSV_URL`. Hai URL cuối lấy dữ liệu từ hai tab trong cùng một file Google Sheet. Các URL nhập trên trang quản lý chỉ dùng cho lần đồng bộ thủ công.

Đặt `SHEET_SYNC_LOCK_DATABASE_URL` bằng URL PostgreSQL trỏ đến cùng database và schema với `DATABASE_URL`. Kết nối khóa phải là kết nối trực tiếp hoặc pooler chế độ session; không dùng transaction pooling. Cấu hình này giúp nhiều instance backend dùng chung một khóa.

Lịch không chạy bù nếu backend ngừng hoạt động lúc 02:00. Mỗi nguồn phải có ít nhất một dòng hợp lệ. Nếu Sheet chính tải thành công, dữ liệu trùng khóa được cập nhật theo Sheet và các dòng `MANUAL`/`CSV_UPLOAD` vắng khỏi Sheet sẽ bị xóa; lịch sử `SHEET_SYNC` và `SPATIAL_PARCELS` được giữ. Ba bảng phụ chỉ thay cache khi cả ba nguồn tải và phân tích thành công.

Trước khi bật lịch trên production lần đầu, hãy sao lưu PostgreSQL, xác nhận bốn URL CSV truy cập được từ backend và chạy thử nghiệp vụ trong schema tạm của cùng database.

Xem kết quả tại lịch sử `SyncLog`: `SHEET_DAILY` là trạng thái tổng, `SHEET_SYNC` là Sheet chính và `SHEET_MODULES` là nhóm bảng phụ. Nếu một lượt thất bại, kiểm tra các URL server và log backend; có thể chạy lại đồng bộ từ trang quản lý.
