# Bộ lọc ngày dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Thêm bộ lọc khoảng ngày tại hai bảng mục 2 và dùng lịch của ứng dụng cho mục 5.

**Architecture:** Hai bộ lọc mục 2 dùng chung `fromDate` và `toDate` đã truyền vào API, nên mọi số liệu mục 2 nhất quán. Mục 5 giữ nguyên state và xác thực khoảng ngày, chỉ thay giao diện chọn ngày.

**Tech Stack:** React, TypeScript, React Aria, Tailwind CSS, TanStack Query.

**Spec:** Yêu cầu người dùng trong cuộc hội thoại ngày 2026-10-29.

## Global Constraints

- Giữ các thay đổi chưa commit trong workspace; không thêm dependency.
- Bộ lọc mục 2 đặt lại phân trang và cho phép xóa khoảng ngày.
- Giữ giới hạn 31 ngày và cách tải dữ liệu của mục 5.

---

### Task 1: Bộ lọc mục 2 và lịch mục 5

**Files:**
- Modify: `apps/web/src/pages/public/DashboardPage.tsx`
- Verify: `apps/web/src/components/ui/date-picker.tsx`

**Interfaces:**
- Consumes: `JollyDatePicker` với `CalendarDate | null`, `parseDate`, `fromDate`, `toDate`, `externalDateRange`.
- Produces: hai bộ lọc đồng bộ với API mục 2; hai lịch hiện ngay trong mục 5.

- [ ] Import `JollyDatePicker`; giữ `DeferredDatePicker` cho phần đang có.
- [ ] Tạo JSX `dailyDateFilters` gồm hai `JollyDatePicker` dùng `fromDate`, `toDate`; ràng buộc `maxValue`/`minValue` theo đầu còn lại. Khi đổi ngày gọi setter tương ứng và `setPage(1)`; nút xóa đặt cả hai chuỗi thành rỗng và `setPage(1)`.
- [ ] Render `dailyDateFilters` tại tiêu đề “Sản lượng thực hiện theo từng ngày” và “Bảng thống kê số thửa từng ngày”; ghi rõ bộ lọc áp dụng cho mục 2.
- [ ] Thay hai `DeferredDatePicker` mục 5 bằng `JollyDatePicker`, giữ nguyên `value` và `onChange`.
- [ ] Chạy `pnpm --filter @land/web typecheck` và `pnpm --filter @land/web build`. Kiểm tra thủ công: chọn/xóa khoảng ngày ở mỗi vị trí mục 2, xác nhận cả hai đồng bộ và bảng phân trang đúng; mở lịch mục 5, đổi ngày và xác nhận lỗi khoảng quá 31 ngày vẫn hiện.
