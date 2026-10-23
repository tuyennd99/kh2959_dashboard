# Thiết kế Dashboard Dữ liệu Đất đai (`D:\project\dashboarddatdai`)

## 1. Mục tiêu & Bối cảnh
Xây dựng hệ thống Dashboard theo dõi và quản lý tiến độ chuẩn hóa dữ liệu đất đai tại `D:\project\dashboarddatdai`, kế thừa kiến trúc monorepo từ `D:\project\chamdiemocop` (lược bỏ toàn bộ nghiệp vụ chấm điểm OCOP).

- **Người xem hằng ngày (Công khai - không cần đăng nhập):** Truy cập trực tiếp `/` để xem số liệu tổng hợp, biểu đồ tiến độ chuẩn hóa từ API `chuanhoa.minhhuub.org` và dữ liệu thống kê từ Google Sheet / nhập liệu, kèm bộ lọc theo ngày, xã, loại dữ liệu và chi nhánh VPĐKĐĐ.
- **Người nhập liệu / Quản trị (Đăng nhập):** Truy cập `/login` và `/manage` để:
  1. Bấm nút **Đồng bộ từ Google Sheet** (tự động đọc CSV từ Google Sheet, tổng hợp theo Ngày + Loại dữ liệu + Xã, bỏ cột Người làm, cập nhật vào PostgreSQL).
  2. **Nhập liệu trực tiếp qua Form** (thêm/sửa/xóa bản ghi cho 3 trường mặc định hiện tại và các trường mở rộng sau này).
  3. **Upload file CSV** để đẩy dữ liệu hàng loạt.
  4. **Quản lý định nghĩa trường mở rộng (`FieldDefinition`)** để thêm chỉ số mới sau này mà không cần sửa schema DB.

## 2. Nguồn dữ liệu & Quy tắc tổng hợp

### 2.1. Nguồn 1: Google Sheet + Nhập tay + Upload CSV (Lưu trong PostgreSQL)
- **URL mặc định:** `https://docs.google.com/spreadsheets/d/16WlVI8xzoxudlmCW7hiMsnynFEr1dNhXuPUBW4XmvzY/export?format=csv&gid=982199452`
- **Cấu trúc cột trong Sheet:** `STT, LOẠI DỮ LIỆU, NGÀY THỰC HIỆN, XÃ, NGƯỜI LÀM, SỐ SỔ, SỐ THỬA`
- **Quy tắc xử lý khi đồng bộ:**
  - Bỏ qua dòng tiêu đề và dòng `TỔNG CỘNG`.
  - **Không lưu và không hiển thị cột `NGƯỜI LÀM`**.
  - Gộp (SUM `SỐ SỔ` và `SỐ THỬA`) các dòng cùng `NGÀY THỰC HIỆN` + `LOẠI DỮ LIỆU` + `XÃ` (vì khi bỏ cột Người làm, nhiều dòng trong cùng một ngày của cùng loại dữ liệu sẽ được cộng dồn lại).
  - Ánh xạ 2 loại dữ liệu hiện có từ Sheet sang các trường chuẩn:
    - `NGOÀI DANH SÁCH` → `OUT_OF_LIST_GCN` (**GCN Ngoài Danh Sách**)
    - `SAI LỆCH THÔNG TIN` → `OWNER_MISMATCH` (**Sai Lệch Thông Tin CSH**)
  - `BA HUYỆN CŨ` (`THREE_OLD_DISTRICTS`) đã ngừng sử dụng; bản ghi cũ được giữ trong DB nhưng không xuất hiện trong dashboard.
  - `STANDARDIZED_MAP_SHEETS` (**Số lượng tờ bản đồ đã chuẩn hóa**) vẫn hỗ trợ nhập qua form/CSV.
  - Hỗ trợ thêm trường mới động thông qua bảng `FieldDefinition` (mã trường, tên hiển thị, đơn vị tính, thứ tự) và lưu bản ghi với `categoryCode` tương ứng hoặc `extraFields` (`JSONB`).

### 2.2. Nguồn 2: API Báo cáo Chuẩn hóa (`chuanhoa.minhhuub.org`)
- **Endpoint:** `GET https://chuanhoa.minhhuub.org/api/public/v1/report` (hỗ trợ query `?branch=...`).
- **Bảo mật:** Backend NestJS giữ `CHUANHOA_API_URL` và `CHUANHOA_API_TOKEN` trong `apps/be/.env`, cung cấp API proxy `/api/dashboard/external-report?branch=...` cho frontend.
- **Dữ liệu hiển thị:**
  - `gcn_total`: Tổng số GCN
  - `boxes.total`: Tổng số hộp
  - `files`: `{ total, da_chuan, chua_chuan, bo_qua }`
  - `folders`: `{ total, da_chuan, chua_chuan, bo_qua }`
  - `branches`: Danh sách chi nhánh (`VPĐKĐĐ KV Hà Quảng`, `VPĐKĐĐ KV Nguyên Bình`...)
  - `generated_at`: Thời gian cập nhật báo cáo

## 3. Thiết kế Database (Prisma + PostgreSQL)

1. **`User`**:
   - `id` (UUID), `email` (unique), `passwordHash`, `fullName`, `role` (`ADMIN`), `createdAt`, `updatedAt`.
2. **`FieldDefinition`** (Quản lý 3 hạng mục mặc định + các trường mở rộng sau này):
   - `id` (UUID), `code` (unique, VD: `OWNER_MISMATCH`, `OUT_OF_LIST_GCN`, `STANDARDIZED_MAP_SHEETS`), `label` (Tên hiển thị), `sheetAlias` (Tên khớp trong Google Sheet, VD: `SAI LỆCH THÔNG TIN`), `isDefault` (Boolean), `sortOrder` (Int), `createdAt`, `updatedAt`.
3. **`LandStatRecord`** (Bản ghi thống kê đất đai theo Ngày + Hạng mục + Xã):
   - `id` (UUID)
   - `reportDate` (Date - Ngày thực hiện)
   - `fieldCode` (String - khóa liên kết `FieldDefinition.code`)
   - `commune` (String, default `""` khi không có xã để đảm bảo unique key)
   - `bookCount` (Int - Số sổ / Số lượng chính)
   - `parcelCount` (Int - Số thửa)
   - `extraData` (Json? - Dự phòng thuộc tính động)
   - `source` (`SHEET_SYNC` | `MANUAL` | `CSV_UPLOAD`)
   - `note` (String?)
   - `createdAt`, `updatedAt`
   - Unique index: `@@unique([reportDate, fieldCode, commune])`
4. **`SyncLog`** (Lịch sử đồng bộ Google Sheet / Upload CSV):
   - `id` (UUID), `source` (String), `sheetUrl` (String?), `recordsSynced` (Int), `status` (String), `message` (String?), `syncedAt` (DateTime).

## 4. Thiết kế Giao diện & Bộ lọc

### 4.1. Trang Dashboard Công khai (`/`)
- **Khu vực 1 — Tiến độ Chuẩn hóa Hồ sơ Quét (từ API `chuanhoa.minhhuub.org`):**
  - Bộ lọc chọn **Chi nhánh** (`Tất cả`, `VPĐKĐĐ KV Hà Quảng`, `VPĐKĐĐ KV Nguyên Bình`) + nút làm mới.
  - 4 thẻ KPI: Tổng GCN (`gcn_total`), Tổng Hộp (`boxes.total`), Tệp đã chuẩn / Tổng tệp (`%`), Thư mục đã chuẩn / Tổng thư mục (`%`).
  - 2 biểu đồ thanh tiến độ / Donut: Tỷ lệ trạng thái **Files** và **Folders** (`Đã chuẩn`, `Chưa chuẩn`, `Bỏ qua`) + biểu đồ so sánh giữa các chi nhánh.
- **Khu vực 2 — Thống kê Nhập liệu & Rà soát Đất đai (từ DB / Google Sheet):**
  - **Bộ lọc:**
    1. Khoảng ngày (`fromDate`, `toDate`) + chọn nhanh (7 ngày, Tháng này, Tất cả).
    2. Hạng mục / Trường dữ liệu (`Tất cả` hoặc chọn từng trường).
    3. Xã (`Tất cả` hoặc chọn xã như Độc Lập, Quang Trung, Đức Long, Hạ Lang, Kim Đồng...).
    4. Chỉ số hiển thị trên biểu đồ: **Số sổ** / **Số thửa**.
  - **Thẻ KPI tổng hợp:**
    - 3 thẻ mặc định (và tự động hiển thị thêm thẻ nếu có trường mới trong `FieldDefinition`):
      1. **Sai Lệch Thông Tin CSH** (Tổng Số sổ & Tổng Số thửa)
      2. **GCN Ngoài Danh Sách** (Tổng Số sổ & Tổng Số thửa)
      3. **Số lượng tờ bản đồ đã chuẩn hóa** (Tổng Số lượng / Số sổ & Số thửa)
  - **Biểu đồ trực quan (SVG/Tailwind hoặc Recharts nhẹ):**
    1. **Biểu đồ cột chồng / nhóm theo Ngày:** Diễn biến số lượng của các hạng mục qua từng ngày.
    2. **Biểu đồ tỷ trọng theo Hạng mục:** So sánh tổng khối lượng giữa các hạng mục.
    3. **Biểu đồ theo Xã:** Thống kê các xã có dữ liệu rà soát.
  - **Bảng dữ liệu:**
    - Bảng tổng hợp theo Ngày (Ngày | Xã | Sai lệch CSH | GCN Ngoài DS | Tờ bản đồ chuẩn hóa | Các trường mới | Tổng thực hiện).
    - Bảng chi tiết từng bản ghi (có tìm kiếm, phân trang).

### 4.2. Trang Quản trị & Nhập liệu (`/login`, `/manage`)
- **Đăng nhập (`/login`):** Email + Mật khẩu (JWT).
- **Quản lý dữ liệu (`/manage`):**
  1. **Khối Đồng bộ Google Sheet:** Hiển thị URL Google Sheet đang cấu hình, thời gian đồng bộ gần nhất, nút **"Đồng bộ ngay"** (gọi `POST /api/manage/sync-sheet`).
  2. **Khối Nhập liệu bằng Form:** Chọn Ngày thực hiện, Chọn Hạng mục (3 trường mặc định + trường mới), Xã (tùy chọn), Số sổ / Số lượng, Số thửa, Ghi chú → Lưu (tạo mới hoặc cập nhật).
  3. **Khối Upload file CSV:** Tải file CSV lên để import nhanh.
  4. **Khối Quản lý Trường dữ liệu (Field Definitions):** Cho phép thêm trường thống kê mới (Tên trường, Mã, Tên cột tương ứng trên Sheet nếu có) để mở rộng về sau.
  5. **Danh sách bản ghi:** Sửa / Xóa từng bản ghi trực tiếp.
