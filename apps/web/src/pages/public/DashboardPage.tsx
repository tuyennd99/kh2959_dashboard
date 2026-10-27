import { useEffect, useState } from "react";
import { parseDate } from "@internationalized/date";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  Archive,
  ArrowDownRight,
  ArrowUpRight,
  FilePenLine,
  CheckCircle2,
  FileCheck2,
  FolderKanban,
  RefreshCw,
  RotateCcw,
  ScanLine,
  Search,
  UserRoundSearch,
} from "lucide-react";
import {
  fetchDashboardRecords,
  fetchDashboardSummary,
  fetchExternalReport,
  fetchSheetModules,
} from "../../api";
import {
  CommuneHorizontalChart,
  DailyStackedBarChart,
  ExternalStatusProgressCard,
  FieldDistributionCard,
  WeeklyComparisonLineChart,
  formatFullDate,
  formatNumber,
  formatShortDate,
  getFieldColorByCode,
} from "../../components/charts/DashboardCharts";
import { TopNav } from "../../components/layout/TopNav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import { Card } from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { DeferredDatePicker } from "../../components/ui/deferred-date-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "../../components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "../../components/ui/table";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "../../components/ui/tabs";

export function DashboardPage() {
  const [fromDate, setFromDate] = useState<string>("");
  const [toDate, setToDate] = useState<string>("");
  const [fieldCode, setFieldCode] = useState<string>("ALL");
  const [commune, setCommune] = useState<string>("ALL");
  const [search, setSearch] = useState<string>("");
  const [page, setPage] = useState<number>(1);
  const [branch, setBranch] = useState<string>("");
  const [dailyPage, setDailyPage] = useState<number>(1);
  const [dailyPageSize, setDailyPageSize] = useState<number>(10);
  const [recordsPageSize, setRecordsPageSize] = useState<number>(10);

  useEffect(() => setDailyPage(1), [fromDate, toDate, fieldCode, commune]);

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", { fromDate, toDate, fieldCode, commune }],
    queryFn: () =>
      fetchDashboardSummary({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        fieldCode: fieldCode === "ALL" ? undefined : fieldCode,
        commune: commune === "ALL" ? undefined : commune,
      }),
    placeholderData: keepPreviousData,
  });

  const recordsQuery = useQuery({
    queryKey: [
      "dashboard-records",
      { fromDate, toDate, fieldCode, commune, search, page, recordsPageSize },
    ],
    queryFn: () =>
      fetchDashboardRecords({
        fromDate: fromDate || undefined,
        toDate: toDate || undefined,
        fieldCode: fieldCode === "ALL" ? undefined : fieldCode,
        commune: commune === "ALL" ? undefined : commune,
        search: search || undefined,
        page,
        limit: recordsPageSize,
      }),
    placeholderData: keepPreviousData,
  });

  const externalQuery = useQuery({
    queryKey: ["external-report", branch],
    queryFn: () => fetchExternalReport(branch || undefined),
    placeholderData: keepPreviousData,
  });

  const sheetModulesQuery = useQuery({
    queryKey: ["sheet-modules"],
    queryFn: () => fetchSheetModules(),
    placeholderData: keepPreviousData,
  });

  const summary = summaryQuery.data;
  const sheetModules = sheetModulesQuery.data;
  const popTotals = sheetModules?.populationMatch.totals;
  const popRows = sheetModules?.populationMatch.rows ?? [];
  const twoTier = sheetModules?.twoTierConversion;
  const vnlis = sheetModules?.vnlisSync;
  const fields = (summary?.fields ?? []).filter(item => item.code !== "STANDARDIZED_MAP_SHEETS");
  const communes = summary?.communes ?? [];
  const byDate = summary?.byDate ?? [];
  const dailyRows = [...byDate].reverse();
  const dailyTotalPages = Math.max(
    1,
    Math.ceil(dailyRows.length / dailyPageSize),
  );
  const currentDailyPage = Math.min(dailyPage, dailyTotalPages);
  const dailyStartIndex = (currentDailyPage - 1) * dailyPageSize;
  const dailyPageRows = dailyRows.slice(
    dailyStartIndex,
    dailyStartIndex + dailyPageSize,
  );
  const records = recordsQuery.data?.data ?? [];
  const recordsMeta = recordsQuery.data?.meta;
  const ext = externalQuery.data;

  const latestDay = byDate.length > 0 ? byDate[byDate.length - 1] : null;
  const prevDay = byDate.length > 1 ? byDate[byDate.length - 2] : null;
  const latestDelta =
    latestDay && prevDay ? latestDay.totalParcels - prevDay.totalParcels : null;
  const avgDailyParcels =
    byDate.length > 0
      ? Math.round((summary?.grandTotal.parcelCount ?? 0) / byDate.length)
      : 0;
  const maxDayParcels = Math.max(1, ...byDate.map((d) => d.totalParcels));

  const hasActiveFilters =
    Boolean(fromDate) ||
    Boolean(toDate) ||
    fieldCode !== "ALL" ||
    commune !== "ALL" ||
    Boolean(search);

  const resetFilters = () => {
    setFromDate("");
    setToDate("");
    setFieldCode("ALL");
    setCommune("ALL");
    setSearch("");
    setPage(1);
  };

  const toggleDayFilter = (dateStr: string) => {
    if (fromDate === dateStr && toDate === dateStr) {
      setFromDate("");
      setToDate("");
    } else {
      setFromDate(dateStr);
      setToDate(dateStr);
    }
    setPage(1);
  };

  return (
    <div className="viz-root min-h-screen">
      <TopNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        <section className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {/* <UserRoundSearch className="size-5 text-primary" /> */}
              <h2 className="text-lg font-bold text-foreground sm:text-2xl">
                1. Đối khớp dữ liệu dân cư (phối hợp với PC06)
              </h2>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void fetchSheetModules(true).then(() => sheetModulesQuery.refetch())}
              disabled={sheetModulesQuery.isFetching}
            >
              <RefreshCw
                className={`size-3.5 ${sheetModulesQuery.isFetching ? "animate-spin" : ""}`}
              />
              <span>Làm mới dữ liệu Sheet</span>
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Tổng thửa
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {formatNumber(popTotals?.totalParcels ?? 1_858_986)}{" "}
                <span className="font-normal text-gray-600 text-base">thửa</span>
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Đã đối khớp thành công
                </p>
                {popTotals?.matchedRate && (
                  <Badge variant="secondary">{popTotals.matchedRate}</Badge>
                )}
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {formatNumber(popTotals?.matchedProvinceWide ?? 1_307_905)}{" "}
                <span className="font-normal text-gray-600 text-base">thửa</span>
              </p>
            </Card>
            <Card className="p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-medium text-muted-foreground">
                  Chưa khớp, chưa đủ điều kiện
                </p>
                {popTotals?.unmatchedRate && (
                  <Badge variant="secondary">{popTotals.unmatchedRate}</Badge>
                )}
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {formatNumber(popTotals?.unmatchedProvinceWide ?? 551_081)}{" "}
                <span className="font-normal text-gray-600 text-base">thửa</span>
              </p>
            </Card>
          </div>

          {/* {popRows.length > 0 && (
            <Card className="p-5">
              <div className="mb-3">
                <h3 className="text-base font-semibold text-foreground">
                  Chi tiết theo dõi đối khớp dữ liệu dân cư theo xã
                </h3>
              </div>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-16">STT</TableHead>
                    <TableHead>Tên xã</TableHead>
                    <TableHead className="text-right">Gửi PC06/xã</TableHead>
                    <TableHead className="text-right">
                      Nhận đã đối khớp
                    </TableHead>
                    <TableHead className="text-right">
                      Đẩy thông tin chủ
                    </TableHead>
                    <TableHead className="text-right">
                      Đẩy thông tin dân cư (theo thửa)
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {popRows.map((row) => (
                    <TableRow key={`${row.stt}-${row.commune}`}>
                      <TableCell className="tabular-nums">{row.stt}</TableCell>
                      <TableCell className="font-medium">
                        {row.commune}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.sentPc06)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.receivedMatched)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(row.pushedOwnerInfo)}
                      </TableCell>
                      <TableCell className="text-right font-semibold tabular-nums">
                        {formatNumber(row.pushedPopulationParcels)}
                      </TableCell>
                    </TableRow>
                  ))}
                  {popTotals && (
                    <TableRow className="bg-secondary/60 font-bold">
                      <TableCell colSpan={2}>Tổng cộng</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(popTotals.sentPc06)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(popTotals.receivedMatched)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(popTotals.pushedOwnerInfo)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(popTotals.pushedPopulationParcels)}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </Card>
          )} */}
        </section>

        {/* =====================================================================
            KHỐI 1: SỔ THEO DÕI SẢN LƯỢNG SỐ THỬA HẰNG NGÀY (ĐƯA LÊN TRƯỚC)
           ===================================================================== */}
        <section
          className={`space-y-4 border-t border-border  pt-6 transition-opacity ${summaryQuery.isFetching ? "opacity-80" : "opacity-100"
            }`}
        >
          <div className="flex items-center gap-2">
            {/* <FilePenLine className="size-5 text-primary" /> */}
            <h2 className="text-lg font-bold text-foreground sm:text-2xl">
              2. Xử lý dữ liệu bóc tách được từ tool
            </h2>
          </div>
          {/* LEDGER PANEL ĐẦU TRANG: Mở trang biết ngay tổng số thửa và từng ngày làm được bao nhiêu */}
          <Card className="overflow-hidden">
            <div className="grid grid-cols-1 divide-y lg:grid-cols-12 lg:divide-x lg:divide-y-0">
              {/* Cột trái: Tổng số thửa đã thực hiện (Hero Figure >= 48px, proportional figures) */}
              <div className="flex flex-col justify-between p-5 sm:p-6 lg:col-span-5 border-(--border-strong)">
                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-muted-foreground">
                      Tổng khối lượng đã thực hiện
                    </span>
                    {hasActiveFilters && (
                      <Badge variant="secondary">Đang lọc dữ liệu</Badge>
                    )}
                  </div>

                  <div className="flex items-baseline gap-2.5 pt-1">
                    <span className="text-5xl font-bold tracking-tight text-foreground sm:text-6xl">
                      {formatNumber(summary?.grandTotal.parcelCount ?? 0)}
                    </span>
                    <span className="text-base font-medium text-muted-foreground">
                      thửa đất
                    </span>
                  </div>
                </div>

                {/* Bảng thông số tóm tắt dạng cột sổ địa chính */}
                <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4">
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Số ngày làm
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                      {byDate.length} ngày
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Bình quân ngày
                    </dt>
                    <dd className="mt-0.5 text-sm font-semibold text-foreground tabular-nums">
                      {formatNumber(avgDailyParcels)} thửa
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">
                      Cập nhật lúc
                    </dt>
                    <dd className="mt-0.5 text-xs font-medium text-foreground tabular-nums">
                      {summary?.lastSync
                        ? new Date(
                          summary.lastSync.syncedAt,
                        ).toLocaleTimeString("vi-VN", {
                          hour: "2-digit",
                          minute: "2-digit",
                        }) +
                        " " +
                        new Date(
                          summary.lastSync.syncedAt,
                        ).toLocaleDateString("vi-VN")
                        : "—"}
                    </dd>
                  </div>
                </dl>
              </div>

              {/* Cột phải: Kết quả thực hiện từng ngày gần nhất */}
              <div className="flex flex-col justify-between bg-secondary/35 p-5 sm:p-6 lg:col-span-7">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <div>
                    <h2 className="text-sm font-semibold text-foreground">
                      Sản lượng thực hiện theo từng ngày
                    </h2>
                    <p className="text-xs text-muted-foreground">
                      Chọn một ngày bất kỳ bên dưới để xem riêng số liệu ngày đó
                    </p>
                  </div>

                  {/* {latestDay && (
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="text-muted-foreground">
                        Ngày mới nhất ({formatShortDate(latestDay.reportDate)}):
                      </span>
                      <strong className="font-bold text-foreground tabular-nums">
                        {formatNumber(latestDay.totalParcels)} thửa
                      </strong>
                      {latestDelta !== null && latestDelta !== 0 && (
                        <span
                          className="inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold tabular-nums"
                          style={{
                            backgroundColor:
                              latestDelta > 0
                                ? "rgba(12, 163, 12, 0.1)"
                                : "rgba(208, 59, 59, 0.1)",
                            color:
                              latestDelta > 0
                                ? "var(--delta-up-good)"
                                : "var(--status-critical)",
                          }}
                        >
                          {latestDelta > 0 ? (
                            <ArrowUpRight className="size-3.5" />
                          ) : (
                            <ArrowDownRight className="size-3.5" />
                          )}
                          {latestDelta > 0 ? "+" : ""}
                          {formatNumber(latestDelta)} thửa
                        </span>
                      )}
                    </div>
                  )} */}
                </div>

                {/* Lưới thẻ từng ngày thực hiện có thanh tiến độ trực quan */}
                <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
                  {byDate.slice(-5).map((day, idx, arr) => {
                    const isLatest = idx === arr.length - 1;
                    const isSelected =
                      fromDate === day.reportDate && toDate === day.reportDate;
                    const fillPct = Math.max(
                      6,
                      Math.round((day.totalParcels / maxDayParcels) * 100),
                    );

                    return (
                      <button
                        key={day.reportDate}
                        type="button"
                        onClick={() => toggleDayFilter(day.reportDate)}
                        className="group flex cursor-pointer flex-col justify-between rounded-lg border bg-card p-3 text-left transition-all hover:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                        style={{
                          borderColor: isSelected
                            ? "var(--series-1)"
                            : isLatest
                              ? "var(--border-strong)"
                              : "var(--gridline)",
                          boxShadow: isSelected
                            ? "0 0 0 1px var(--series-1)"
                            : undefined,
                        }}
                      >
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-muted-foreground tabular-nums">
                            {formatShortDate(day.reportDate)}
                          </span>
                          {isLatest && (
                            <span className="rounded bg-accent-soft px-1.5 py-0.5 text-[10px] font-semibold text-primary">
                              Mới nhất
                            </span>
                          )}
                        </div>

                        <div className="my-2">
                          <div className="text-xl font-bold tracking-tight text-foreground">
                            {formatNumber(day.totalParcels)}
                          </div>
                          <div className="text-[11px] text-muted-foreground">
                            thửa đất
                          </div>
                        </div>

                        {/* Thanh tỷ lệ so với ngày cao nhất */}
                        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${fillPct}%`,
                              backgroundColor: isSelected
                                ? "var(--primary)"
                                : "var(--series-1)",
                            }}
                          />
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </Card>

          {/* 4 THẺ HẠNG MỤC (STAT TILES): Bấm để lọc nhanh từng hạng mục */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {fields.map((f, idx) => {
              const totalParcels =
                summary?.totalsByField[f.code]?.parcelCount ?? 0;
              const grandParcels = summary?.grandTotal.parcelCount ?? 0;
              const sharePct =
                grandParcels > 0
                  ? Math.round((totalParcels / grandParcels) * 1000) / 10
                  : 0;
              const latestFieldParcels =
                latestDay?.values[f.code]?.parcelCount ?? 0;
              const color = getFieldColorByCode(f.code, idx);
              const isSelected = fieldCode === f.code;

              return (
                <button
                  key={f.code}
                  type="button"
                  onClick={() => {
                    setFieldCode(isSelected ? "ALL" : f.code);
                    setPage(1);
                  }}
                  className="flex cursor-pointer flex-col justify-between rounded-xl border bg-card p-4 text-left transition-all hover:border-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                  style={{
                    borderColor: isSelected ? color : "var(--border-strong)",
                    boxShadow: isSelected ? `0 0 0 1px ${color}` : undefined,
                  }}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span
                        className="size-2.5 shrink-0 rounded-xs"
                        style={{ backgroundColor: color }}
                      />
                      <span
                        className="line-clamp-1 text-xs font-semibold text-muted-foreground"
                        title={f.label}
                      >
                        {f.label}
                      </span>
                    </div>
                    <span className="rounded bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground tabular-nums">
                      {sharePct}%
                    </span>
                  </div>

                  <div className="mt-3 flex items-baseline gap-1.5">
                    <span className="text-3xl font-bold tracking-tight text-foreground">
                      {formatNumber(totalParcels)}
                    </span>
                    <span className="text-xs font-medium text-muted-foreground">
                      thửa
                    </span>
                  </div>

                  <div className="mt-3 flex items-center justify-between border-t border-border pt-2.5 text-xs text-muted-foreground">
                    <span>
                      Ngày{" "}
                      {latestDay ? formatShortDate(latestDay.reportDate) : "—"}
                    </span>
                    <strong className="font-semibold text-foreground tabular-nums">
                      +{formatNumber(latestFieldParcels)} thửa
                    </strong>
                  </div>
                </button>
              );
            })}
          </div>

          {/* THANH LỌC CO GIÃN VÀ TỰ XUỐNG DÒNG */}
          {/* <Card className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <DeferredDatePicker
                label="Từ ngày thực hiện"
                className="w-[152px] max-w-full"
                value={fromDate ? parseDate(fromDate) : null}
                onChange={(date) => {
                  setFromDate(date?.toString() ?? "");
                  setPage(1);
                }}
              />

              <DeferredDatePicker
                label="Đến ngày thực hiện"
                className="w-[152px] max-w-full"
                value={toDate ? parseDate(toDate) : null}
                onChange={(date) => {
                  setToDate(date?.toString() ?? "");
                  setPage(1);
                }}
              />

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground">
                  Hạng mục dữ liệu
                </label>
                <Select
                  value={fieldCode}
                  onValueChange={(val) => {
                    setFieldCode(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className="w-[248px] max-w-full"
                    aria-label="Chọn hạng mục dữ liệu"
                  >
                    <SelectValue placeholder="Tất cả hạng mục" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả hạng mục</SelectItem>
                    {fields.map((f) => (
                      <SelectItem key={f.code} value={f.code}>
                        {f.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <label className="block text-xs font-semibold text-muted-foreground">
                  Đơn vị xã
                </label>
                <Select
                  value={commune}
                  onValueChange={(val) => {
                    setCommune(val);
                    setPage(1);
                  }}
                >
                  <SelectTrigger
                    className="w-[196px] max-w-full"
                    aria-label="Chọn đơn vị xã"
                  >
                    <SelectValue placeholder="Tất cả các xã" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">Tất cả các xã</SelectItem>
                    <SelectItem value="__EMPTY__">(Chưa phân xã)</SelectItem>
                    {communes.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Button
                  variant="outline"
                  className="gap-1.5"
                  onClick={resetFilters}
                  title="Đặt lại toàn bộ bộ lọc"
                >
                  <RotateCcw className="size-3.5" />
                  <span>Đặt lại bộ lọc</span>
                </Button>
              </div>
            </div>
          </Card> */}

          {/* BIỂU ĐỒ SẢN LƯỢNG HẰNG NGÀY & CƠ CẤU */}
          {/* <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <Card className="p-5 lg:col-span-2">
              <div className="mb-4">
                <h2 className="text-base font-semibold text-foreground">
                  Biểu đồ sản lượng số thửa thực hiện theo ngày
                </h2>
                <p className="text-xs text-muted-foreground">
                  Di chuột hoặc chọn từng cột ngày để xem số thửa của mỗi hạng
                  mục trong ngày đó
                </p>
              </div>
              <DailyStackedBarChart
                byDate={byDate}
                fields={fields}
                onSelectDate={toggleDayFilter}
              />
            </Card>

            <div className="space-y-4">
              <Card className="p-5">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-foreground">
                    Tỷ trọng theo hạng mục
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Phân bổ tổng số thửa giữa các nhóm dữ liệu
                  </p>
                </div>
                <FieldDistributionCard
                  fields={fields}
                  totalsByField={summary?.totalsByField ?? {}}
                />
              </Card>

              <Card className="p-5">
                <div className="mb-3">
                  <h3 className="text-base font-semibold text-foreground">
                    Số thửa theo xã
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Thống kê các xã có ghi nhận dữ liệu riêng
                  </p>
                </div>
                <CommuneHorizontalChart
                  byCommune={summary?.byCommune ?? []}
                  selectedCommune={commune}
                  onSelectCommune={(val) => {
                    setCommune(val);
                    setPage(1);
                  }}
                />
              </Card>
            </div>
          </div> */}

          {/* BIỂU ĐỒ SO SÁNH TIẾN ĐỘ GIỮA CÁC TUẦN */}
          {/* <Card className="p-5">
            <div className="mb-4">
              <h2 className="text-base font-semibold text-foreground">
                Biểu đồ đường so sánh tiến độ giữa các tuần
              </h2>
              <p className="text-xs text-muted-foreground">
                So sánh khối lượng thực hiện từng ngày (Thứ 2 đến Chủ nhật) giữa tuần này và các tuần trước đó
              </p>
            </div>
            <WeeklyComparisonLineChart byDate={byDate} />
          </Card> */}

          {/* BẢNG SỐ LIỆU HẰNG NGÀY & CHI TIẾT */}
          <Card className="p-5">
            <Tabs defaultValue="daily">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-foreground">
                    Bảng thống kê số thửa từng ngày
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Đơn vị tính: thửa đất (sắp xếp từ ngày mới nhất)
                  </p>
                </div>
                <TabsList>
                  <TabsTrigger value="daily">
                    Tổng hợp theo ngày
                    {/* Tổng hợp theo ngày ({byDate.length} ngày) */}
                  </TabsTrigger>
                  <TabsTrigger value="records">
                    Chi tiết theo xã
                    {/* Chi tiết theo xã ({recordsMeta?.total ?? 0} dòng) */}
                  </TabsTrigger>
                </TabsList>
              </div>

              <TabsContent value="daily" className="mt-4">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="whitespace-nowrap">
                        Ngày thực hiện
                      </TableHead>
                      <TableHead className="text-right font-bold whitespace-nowrap text-foreground">
                        Tổng cộng ngày
                      </TableHead>
                      {fields.map((f, idx) => (
                        <TableHead
                          key={f.code}
                          className="text-right whitespace-nowrap"
                        >
                          <span className="inline-flex items-center justify-end gap-1.5">
                            <span
                              className="size-2 shrink-0 rounded-xs"
                              style={{
                                backgroundColor: getFieldColorByCode(
                                  f.code,
                                  idx,
                                ),
                              }}
                            />
                            <span>{f.label}</span>
                          </span>
                        </TableHead>
                      ))}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byDate.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={fields.length + 2}
                          className="py-8 text-center text-muted-foreground"
                        >
                          Không có dữ liệu trong khoảng ngày đang chọn. Hãy bấm
                          &ldquo;Đặt lại&rdquo; để xem toàn bộ các ngày.
                        </TableCell>
                      </TableRow>
                    ) : (
                      dailyPageRows.map((day) => (
                        <TableRow key={day.reportDate}>
                          <TableCell className="font-semibold whitespace-nowrap tabular-nums">
                            {formatFullDate(day.reportDate)}
                          </TableCell>
                          <TableCell className="text-right font-bold whitespace-nowrap tabular-nums">
                            {formatNumber(day.totalParcels)}
                          </TableCell>
                          {fields.map((f) => {
                            const parcels =
                              day.values[f.code]?.parcelCount ?? 0;
                            return (
                              <TableCell
                                key={f.code}
                                className="text-right whitespace-nowrap tabular-nums"
                              >
                                {parcels > 0 ? (
                                  <span className="font-medium">
                                    {formatNumber(parcels)}
                                  </span>
                                ) : (
                                  <span className="text-muted-foreground/50">
                                    —
                                  </span>
                                )}
                              </TableCell>
                            );
                          })}
                        </TableRow>
                      ))
                    )}
                    {byDate.length > 0 && (
                      <TableRow className="bg-secondary/60 font-bold">
                        <TableCell className="font-bold whitespace-nowrap">
                          Tổng cộng toàn đợt
                        </TableCell>
                        <TableCell className="text-right font-bold whitespace-nowrap tabular-nums">
                          {formatNumber(summary?.grandTotal.parcelCount ?? 0)}
                        </TableCell>
                        {fields.map((f) => (
                          <TableCell
                            key={f.code}
                            className="text-right font-bold whitespace-nowrap tabular-nums"
                          >
                            {formatNumber(
                              summary?.totalsByField[f.code]?.parcelCount ?? 0,
                            )}
                          </TableCell>
                        ))}
                      </TableRow>
                    )}
                  </TableBody>
                </Table>

                {byDate.length > 0 && (
                  <div className="flex flex-col gap-3 border-t pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-muted-foreground">
                      Hiển thị {dailyStartIndex + 1}–
                      {Math.min(dailyStartIndex + dailyPageSize, byDate.length)}{" "}
                      / {byDate.length} ngày
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">Số dòng</span>
                      <Select
                        value={String(dailyPageSize)}
                        onValueChange={(value) => {
                          setDailyPageSize(Number(value));
                          setDailyPage(1);
                        }}
                      >
                        <SelectTrigger
                          className="w-19"
                          aria-label="Số dòng mỗi trang"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="20">20</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="px-1 text-muted-foreground">
                        Trang {currentDailyPage} / {dailyTotalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentDailyPage <= 1}
                        onClick={() => setDailyPage(currentDailyPage - 1)}
                      >
                        Trang trước
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={currentDailyPage >= dailyTotalPages}
                        onClick={() => setDailyPage(currentDailyPage + 1)}
                      >
                        Trang sau
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="records" className="mt-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="relative max-w-sm flex-1">
                    <Search className="pointer-events-none absolute top-2.5 left-3 size-4 text-muted-foreground" />
                    <Input
                      placeholder="Tìm theo tên xã, hạng mục, ghi chú..."
                      value={search}
                      onChange={(e) => {
                        setSearch(e.target.value);
                        setPage(1);
                      }}
                      className="pl-9"
                    />
                  </div>
                </div>

                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Ngày thực hiện</TableHead>
                      <TableHead>Hạng mục dữ liệu</TableHead>
                      <TableHead>Đơn vị xã</TableHead>
                      <TableHead className="text-right">Số thửa</TableHead>
                      {/* <TableHead>Nguồn dữ liệu</TableHead> */}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.length === 0 ? (
                      <TableRow>
                        <TableCell
                          colSpan={5}
                          className="py-8 text-center text-muted-foreground"
                        >
                          Không tìm thấy bản ghi phù hợp với từ khóa.
                        </TableCell>
                      </TableRow>
                    ) : (
                      records.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium whitespace-nowrap tabular-nums">
                            {formatFullDate(r.reportDate)}
                          </TableCell>
                          <TableCell>{r.fieldLabel ?? r.fieldCode}</TableCell>
                          <TableCell>
                            {r.commune || (
                              <span className="text-muted-foreground">
                                Toàn khu vực
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-right font-semibold whitespace-nowrap tabular-nums">
                            {formatNumber(r.parcelCount)}
                          </TableCell>
                          {/* <TableCell>
                            <Badge variant="secondary">
                              {r.source === "SHEET_SYNC"
                                ? "Google Sheet"
                                : r.source === "CSV_UPLOAD"
                                  ? "File CSV"
                                  : "Nhập tay"}
                            </Badge>
                          </TableCell> */}
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>

                {recordsMeta && recordsMeta.total > 0 && (
                  <div className="flex flex-col gap-3 border-t pt-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-muted-foreground">
                      Hiển thị{" "}
                      {(recordsMeta.page - 1) * recordsMeta.limit + 1}–
                      {Math.min(
                        recordsMeta.page * recordsMeta.limit,
                        recordsMeta.total,
                      )}{" "}
                      / {recordsMeta.total} bản ghi
                    </span>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-muted-foreground">Số dòng</span>
                      <Select
                        value={String(recordsPageSize)}
                        onValueChange={(value) => {
                          setRecordsPageSize(Number(value));
                          setPage(1);
                        }}
                      >
                        <SelectTrigger
                          className="w-[76px]"
                          aria-label="Số bản ghi mỗi trang"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="10">10</SelectItem>
                          <SelectItem value="25">25</SelectItem>
                          <SelectItem value="50">50</SelectItem>
                        </SelectContent>
                      </Select>
                      <span className="px-1 text-muted-foreground">
                        Trang {recordsMeta.page} / {recordsMeta.totalPages}
                      </span>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                      >
                        Trang trước
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={page >= recordsMeta.totalPages}
                        onClick={() => setPage((p) => p + 1)}
                      >
                        Trang sau
                      </Button>
                    </div>
                  </div>
                )}
              </TabsContent>
            </Tabs>
          </Card>
        </section>

        {/* =====================================================================
            KHỐI 3: QUY ĐỔI TỜ THỬA TỪ 3 CẤP SANG 2 CẤP
           ===================================================================== */}
        <section className="space-y-3 border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground sm:text-2xl">
              3. Quy đổi tờ thửa từ 3 cấp sang 2 cấp
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Tổng số thửa đã quy đổi
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {formatNumber(twoTier?.totalParcels ?? 0)}{" "}
                <span className="text-base font-normal text-gray-600">
                  thửa
                </span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Số đơn vị xã đã thực hiện
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {formatNumber(twoTier?.rows.length ?? 0)}{" "}
                <span className="text-base font-normal text-gray-600">xã</span>
              </p>
            </Card>
          </div>

          <Card className="p-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">STT</TableHead>
                  <TableHead>Tên xã</TableHead>
                  <TableHead className="text-right">Số thửa</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(twoTier?.rows ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={3}
                      className="py-6 text-center text-muted-foreground"
                    >
                      Đang tải dữ liệu quy đổi tờ thửa...
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {twoTier?.rows.map((row) => (
                      <TableRow key={`${row.stt}-${row.commune}`}>
                        <TableCell className="tabular-nums">
                          {row.stt}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.commune}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatNumber(row.parcelCount)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary/60 font-bold">
                      <TableCell colSpan={2}>Tổng cộng</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(twoTier?.totalParcels ?? 0)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* =====================================================================
            KHỐI 4: TRÍCH XUẤT, KÝ SỐ, ĐỒNG BỘ LÊN VNLIS
           ===================================================================== */}
        <section className="space-y-3 border-t border-border pt-6">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-foreground sm:text-2xl">
              4. Trích xuất, ký số, đồng bộ lên VNLIS
            </h2>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Trích xuất từ iLIS
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {formatNumber(vnlis?.totals.extractedIlis ?? 0)}{" "}
                <span className="text-base font-normal text-gray-600">
                  thửa
                </span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Ký số XML
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {formatNumber(vnlis?.totals.signedXml ?? 0)}{" "}
                <span className="text-base font-normal text-gray-600">
                  thửa
                </span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Đẩy VNLIS
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {formatNumber(vnlis?.totals.pushedVnlis ?? 0)}{" "}
                <span className="text-base font-normal text-gray-600">
                  thửa
                </span>
              </p>
            </Card>
            <Card className="p-4">
              <p className="text-xs font-medium text-muted-foreground">
                Kết quả VNLIS tăng thêm
              </p>
              <p className="mt-2 text-2xl font-bold text-foreground tabular-nums">
                {formatNumber(vnlis?.totals.vnlisAddedResult ?? 0)}{" "}
                <span className="text-base font-normal text-gray-600">
                  thửa
                </span>
              </p>
            </Card>
          </div>

          <Card className="p-5">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">STT</TableHead>
                  <TableHead>Tên xã</TableHead>
                  <TableHead className="text-right">
                    Trích xuất từ iLIS
                  </TableHead>
                  <TableHead className="text-right">Ký số XML</TableHead>
                  <TableHead className="text-right">Đẩy VNLIS</TableHead>
                  <TableHead className="text-right">
                    Kết quả VNLIS tăng thêm
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(vnlis?.rows ?? []).length === 0 ? (
                  <TableRow>
                    <TableCell
                      colSpan={6}
                      className="py-6 text-center text-muted-foreground"
                    >
                      Đang tải dữ liệu đồng bộ VNLIS...
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {vnlis?.rows.map((row) => (
                      <TableRow key={`${row.stt}-${row.commune}`}>
                        <TableCell className="tabular-nums">
                          {row.stt}
                        </TableCell>
                        <TableCell className="font-medium">
                          {row.commune}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.extractedIlis)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.signedXml)}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatNumber(row.pushedVnlis)}
                        </TableCell>
                        <TableCell className="text-right font-semibold tabular-nums">
                          {formatNumber(row.vnlisAddedResult)}
                        </TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-secondary/60 font-bold">
                      <TableCell colSpan={2}>Tổng cộng</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(vnlis?.totals.extractedIlis ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(vnlis?.totals.signedXml ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(vnlis?.totals.pushedVnlis ?? 0)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatNumber(vnlis?.totals.vnlisAddedResult ?? 0)}
                      </TableCell>
                    </TableRow>
                  </>
                )}
              </TableBody>
            </Table>
          </Card>
        </section>

        {/* =====================================================================
            KHỐI 5: TIẾN ĐỘ CHUẨN HÓA HỒ SƠ LƯU TRỮ (API CHUANHOA.MINHHUUB.ORG)
           ===================================================================== */}
        <section className="space-y-3 border-t border-border pt-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              {/* <ScanLine className="size-5 text-primary" /> */}
              <h2 className="text-lg font-bold text-foreground sm:text-2xl">
                5. Nhóm ngoại nghiệp
              </h2>
            </div>

          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1 rounded-lg border bg-secondary p-1">
              <button
                type="button"
                onClick={() => setBranch("")}
                className="cursor-pointer rounded-md px-3 py-1 text-xs font-semibold transition-all"
                style={{
                  backgroundColor:
                    branch === "" ? "var(--surface-1)" : "transparent",
                  color:
                    branch === ""
                      ? "var(--text-primary)"
                      : "var(--text-secondary)",
                  boxShadow:
                    branch === ""
                      ? "0 1px 2px rgba(0, 0, 0, 0.06)"
                      : undefined,
                }}
              >
                Tất cả chi nhánh
              </button>
              {(
                ext?.branches ?? [
                  "VPĐKĐĐ KV Hà Quảng",
                  "VPĐKĐĐ KV Nguyên Bình",
                ]
              ).map((b) => (
                <button
                  key={b}
                  type="button"
                  onClick={() => setBranch(b)}
                  className="cursor-pointer rounded-md px-3 py-1 text-xs font-semibold transition-all"
                  style={{
                    backgroundColor:
                      branch === b ? "var(--surface-1)" : "transparent",
                    color:
                      branch === b
                        ? "var(--text-primary)"
                        : "var(--text-secondary)",
                    boxShadow:
                      branch === b
                        ? "0 1px 2px rgba(0, 0, 0, 0.06)"
                        : undefined,
                  }}
                >
                  {b}
                </button>
              ))}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void externalQuery.refetch()}
              disabled={externalQuery.isFetching}
            >
              <RefreshCw
                className={`size-3.5 ${externalQuery.isFetching ? "animate-spin" : ""}`}
              />
              <span>Làm mới</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Card className="p-4">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Tổng số GCN</span>
                <CheckCircle2 className="size-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {formatNumber(ext?.gcn_total ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {branch || "Toàn bộ chi nhánh VPĐKĐĐ"}
              </p>
            </Card>

            <Card className="p-4">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Tổng số hộp hồ sơ</span>
                <Archive className="size-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {formatNumber(ext?.boxes.total ?? 0)}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Hộp tài liệu lưu trữ đã quét
              </p>
            </Card>

            {/* <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Tệp tài liệu đã chuẩn</span>
                <FileCheck2 className="size-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {formatNumber(ext?.files.da_chuan ?? 0)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {formatNumber(ext?.files.total ?? 0)}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Chưa chuẩn: {formatNumber(ext?.files.chua_chuan ?? 0)}
              </p>
            </div>

            <div className="rounded-xl border bg-card p-4">
              <div className="flex items-center justify-between text-xs font-medium text-muted-foreground">
                <span>Thư mục đã chuẩn</span>
                <FolderKanban className="size-4 text-primary" />
              </div>
              <p className="mt-2 text-2xl font-bold text-foreground">
                {formatNumber(ext?.folders.da_chuan ?? 0)}{" "}
                <span className="text-sm font-normal text-muted-foreground">
                  / {formatNumber(ext?.folders.total ?? 0)}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                Chưa chuẩn: {formatNumber(ext?.folders.chua_chuan ?? 0)}
              </p>
            </div> */}
          </div>

          {/* {ext && (
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <ExternalStatusProgressCard
                title="Tỷ lệ chuẩn hóa tệp tài liệu (Files)"
                subtitle={`Tổng số: ${formatNumber(ext.files.total)} tệp`}
                stats={ext.files}
              />
              <ExternalStatusProgressCard
                title="Tỷ lệ chuẩn hóa thư mục hồ sơ (Folders)"
                subtitle={`Tổng số: ${formatNumber(ext.folders.total)} thư mục`}
                stats={ext.folders}
              />
            </div>
          )} */}
        </section>
      </main>
    </div>
  );
}
