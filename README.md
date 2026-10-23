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
