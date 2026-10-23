import { useState, type ChangeEvent, type FormEvent } from "react";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Navigate } from "@tanstack/react-router";
import {
  CloudDownload,
  FileSpreadsheet,
  Plus,
  Save,
  Trash2,
  Upload,
} from "lucide-react";
import {
  createFieldDefinitionApi,
  deleteFieldDefinitionApi,
  deleteLandRecordApi,
  fetchDashboardRecords,
  fetchDashboardSummary,
  importCsvApi,
  syncGoogleSheetApi,
  upsertLandRecordApi,
} from "../../api";
import {
  formatFullDate,
  formatNumber,
} from "../../components/charts/DashboardCharts";
import { TopNav } from "../../components/layout/TopNav";
import { Badge } from "../../components/ui/badge";
import { Button } from "../../components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "../../components/ui/card";
import { Input } from "../../components/ui/input";
import { DeferredDatePicker } from "../../components/ui/deferred-date-picker";
import { Label } from "../../components/ui/label";
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
import { Textarea } from "../../components/ui/textarea";
import { useSessionStore } from "../../stores/session-store";

const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/16WlVI8xzoxudlmCW7hiMsnynFEr1dNhXuPUBW4XmvzY/edit?gid=982199452#gid=982199452";

export function ManagePage() {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();

  const [sheetUrl, setSheetUrl] = useState(DEFAULT_SHEET_URL);
  const [replaceExisting, setReplaceExisting] = useState(true);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const todayIso = today(getLocalTimeZone()).toString();
  const [reportDate, setReportDate] = useState(todayIso);
  const [fieldCode, setFieldCode] = useState("STANDARDIZED_MAP_SHEETS");
  const [commune, setCommune] = useState("");
  const [parcelCount, setParcelCount] = useState("0");
  const [note, setNote] = useState("");

  const [csvText, setCsvText] = useState("");

  const [newFieldCode, setNewFieldCode] = useState("");
  const [newFieldLabel, setNewFieldLabel] = useState("");
  const [newFieldAlias, setNewFieldAlias] = useState("");

  const summaryQuery = useQuery({
    queryKey: ["dashboard-summary", {}],
    queryFn: () => fetchDashboardSummary({}),
    enabled: Boolean(session),
  });

  const recordsQuery = useQuery({
    queryKey: ["dashboard-records", { page: 1, limit: 50 }],
    queryFn: () => fetchDashboardRecords({ page: 1, limit: 50 }),
    enabled: Boolean(session),
  });

  const invalidateAll = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard-records"] }),
    ]);
  };

  const syncMutation = useMutation({
    mutationFn: () =>
      syncGoogleSheetApi({
        sheetUrl: sheetUrl.trim() || undefined,
        replaceExisting,
      }),
    onSuccess: async (log) => {
      setStatusMessage({
        type: "success",
        text:
          log.message ||
          `Đã đồng bộ thành công ${log.recordsSynced} nhóm bản ghi từ Google Sheet.`,
      });
      await invalidateAll();
    },
    onError: (err) => {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi đồng bộ Google Sheet",
      });
    },
  });

  const upsertMutation = useMutation({
    mutationFn: () =>
      upsertLandRecordApi({
        reportDate,
        fieldCode,
        commune: commune.trim(),
        bookCount: 0,
        parcelCount: Number(parcelCount) || 0,
        note: note.trim() || undefined,
      }),
    onSuccess: async () => {
      setStatusMessage({
        type: "success",
        text: "Đã lưu số thửa thành công.",
      });
      setParcelCount("0");
      setNote("");
      await invalidateAll();
    },
    onError: (err) => {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Không thể lưu bản ghi",
      });
    },
  });

  const csvMutation = useMutation({
    mutationFn: () =>
      importCsvApi({
        csvContent: csvText,
        replaceExisting: false,
      }),
    onSuccess: async (log) => {
      setStatusMessage({
        type: "success",
        text:
          log.message || `Đã nhập thành công ${log.recordsSynced} dòng từ CSV.`,
      });
      setCsvText("");
      await invalidateAll();
    },
    onError: (err) => {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi nhập CSV",
      });
    },
  });

  const createFieldMutation = useMutation({
    mutationFn: () =>
      createFieldDefinitionApi({
        code: newFieldCode,
        label: newFieldLabel,
        sheetAlias: newFieldAlias || undefined,
      }),
    onSuccess: async (created) => {
      setStatusMessage({
        type: "success",
        text: `Đã thêm trường dữ liệu mới: ${created.label} (${created.code})`,
      });
      setNewFieldCode("");
      setNewFieldLabel("");
      setNewFieldAlias("");
      await invalidateAll();
    },
    onError: (err) => {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Lỗi tạo trường mới",
      });
    },
  });

  const deleteRecordMutation = useMutation({
    mutationFn: (id: string) => deleteLandRecordApi(id),
    onSuccess: async () => {
      await invalidateAll();
    },
  });

  const deleteFieldMutation = useMutation({
    mutationFn: (id: string) => deleteFieldDefinitionApi(id),
    onSuccess: async () => {
      await invalidateAll();
    },
  });

  if (!session) {
    return <Navigate to="/login" />;
  }

  const fields = summaryQuery.data?.fields ?? [];
  const records = recordsQuery.data?.data ?? [];

  const handleFileUpload = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        setCsvText(reader.result);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  const handleManualSubmit = (e: FormEvent) => {
    e.preventDefault();
    upsertMutation.mutate();
  };

  const handleCreateFieldSubmit = (e: FormEvent) => {
    e.preventDefault();
    createFieldMutation.mutate();
  };

  return (
    <div className="viz-root min-h-screen">
      <TopNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {statusMessage && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm font-medium ${
              statusMessage.type === "success"
                ? "border-emerald-300 bg-emerald-50 text-emerald-900"
                : "border-red-300 bg-red-50 text-red-900"
            }`}
          >
            {statusMessage.text}
          </div>
        )}

        {/* 1. ĐỒNG BỘ GOOGLE SHEET */}
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <FileSpreadsheet className="size-5 text-primary" />
              <CardTitle>Đồng bộ số thửa trực tiếp từ Google Sheet</CardTitle>
            </div>
            <CardDescription>
              Tự động đọc các cột{" "}
              <code>LOẠI DỮ LIỆU | NGÀY THỰC HIỆN | XÃ | SỐ THỬA</code>, bỏ qua
              cột <code>NGƯỜI LÀM</code> và các dòng <code>TỔNG CỘNG</code>,
              cộng gộp tổng số thửa theo Ngày, Loại dữ liệu và Xã.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex flex-col gap-3 sm:flex-row">
              <Input
                value={sheetUrl}
                onChange={(e) => setSheetUrl(e.target.value)}
                placeholder="Dán đường dẫn Google Sheet (chế độ xem công khai)..."
                className="flex-1"
              />
              <Button
                onClick={() => syncMutation.mutate()}
                disabled={syncMutation.isPending}
                className="gap-2"
              >
                <CloudDownload className="size-4" />
                <span>
                  {syncMutation.isPending
                    ? "Đang đồng bộ..."
                    : "Đồng bộ từ Google Sheet"}
                </span>
              </Button>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <label
                htmlFor="replace-existing-sheet"
                className="flex items-center gap-2"
              >
                <input
                  id="replace-existing-sheet"
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={(e) => setReplaceExisting(e.target.checked)}
                />
                <span>
                  Làm mới toàn bộ bản ghi đồng bộ từ Google Sheet (giữ nguyên
                  bản ghi nhập tay)
                </span>
              </label>
              {summaryQuery.data?.lastSync && (
                <span>
                  Lần đồng bộ gần nhất:{" "}
                  <strong className="text-foreground">
                    {new Date(
                      summaryQuery.data.lastSync.syncedAt,
                    ).toLocaleString("vi-VN")}
                  </strong>{" "}
                  ({summaryQuery.data.lastSync.recordsSynced} nhóm bản ghi)
                </span>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 2. NHẬP LIỆU TRỰC TIẾP & UPLOAD CSV */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Nhập hoặc cập nhật số thửa thủ công</CardTitle>
              <CardDescription>
                Nhập số lượng cho &ldquo;Số lượng tờ bản đồ đã chuẩn hóa&rdquo;
                hoặc bất kỳ hạng mục nào theo ngày và xã.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleManualSubmit} className="space-y-3.5">
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <DeferredDatePicker
                    label="Ngày thực hiện"
                    isRequired
                    className="w-full"
                    value={parseDate(reportDate)}
                    onChange={(date) => setReportDate(date?.toString() ?? "")}
                  />
                  <div className="space-y-1.5">
                    <Label>Hạng mục dữ liệu</Label>
                    <Select value={fieldCode} onValueChange={setFieldCode}>
                      <SelectTrigger aria-label="Chọn hạng mục dữ liệu">
                        <SelectValue placeholder="Chọn hạng mục" />
                      </SelectTrigger>
                      <SelectContent>
                        {fields.map((f) => (
                          <SelectItem key={f.code} value={f.code}>
                            {f.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-commune">Đơn vị xã (tùy chọn)</Label>
                    <Input
                      id="manual-commune"
                      placeholder="VD: Độc Lập, Quảng Uyên..."
                      value={commune}
                      onChange={(e) => setCommune(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-parcel-count">Số thửa</Label>
                    <Input
                      id="manual-parcel-count"
                      type="number"
                      min={0}
                      required
                      value={parcelCount}
                      onChange={(e) => setParcelCount(e.target.value)}
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manual-note">Ghi chú (tùy chọn)</Label>
                  <Input
                    id="manual-note"
                    placeholder="Ghi chú bổ sung..."
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                  />
                </div>

                <Button
                  type="submit"
                  className="gap-2"
                  disabled={upsertMutation.isPending}
                >
                  <Save className="size-4" />
                  <span>
                    {upsertMutation.isPending ? "Đang lưu..." : "Lưu số thửa"}
                  </span>
                </Button>
              </form>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Tải lên file CSV hoặc dán bảng dữ liệu</CardTitle>
              <CardDescription>
                Hỗ trợ file CSV xuất từ Excel hoặc Google Sheet theo đúng cấu
                trúc cột
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3.5">
              <div>
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  onChange={handleFileUpload}
                />
              </div>
              <Textarea
                rows={5}
                placeholder="Hoặc dán trực tiếp nội dung CSV vào đây..."
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <Button
                variant="outline"
                className="gap-2"
                disabled={!csvText.trim() || csvMutation.isPending}
                onClick={() => csvMutation.mutate()}
              >
                <Upload className="size-4" />
                <span>
                  {csvMutation.isPending
                    ? "Đang xử lý CSV..."
                    : "Nhập dữ liệu từ CSV"}
                </span>
              </Button>
            </CardContent>
          </Card>
        </div>

        {/* 3. QUẢN LÝ TRƯỜNG DỮ LIỆU MỞ RỘNG */}
        <Card>
          <CardHeader>
            <CardTitle>
              Cấu hình các hạng mục dữ liệu (mở rộng thêm trường mới)
            </CardTitle>
            <CardDescription>
              Hiện có 3 hạng mục mặc định. Khi cần theo dõi thêm chỉ tiêu mới,
              thêm trực tiếp tại đây.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form
              onSubmit={handleCreateFieldSubmit}
              className="grid grid-cols-1 gap-3 sm:grid-cols-4"
            >
              <Input
                placeholder="Mã trường (VD: CHUYEN_MUC_DICH)"
                required
                value={newFieldCode}
                onChange={(e) => setNewFieldCode(e.target.value)}
              />
              <Input
                placeholder="Tên hiển thị trên bảng theo dõi"
                required
                value={newFieldLabel}
                onChange={(e) => setNewFieldLabel(e.target.value)}
              />
              <Input
                placeholder="Tên nhãn tương ứng trong Sheet"
                value={newFieldAlias}
                onChange={(e) => setNewFieldAlias(e.target.value)}
              />
              <Button
                type="submit"
                variant="outline"
                className="gap-1.5"
                disabled={createFieldMutation.isPending}
              >
                <Plus className="size-4" />
                <span>Thêm hạng mục mới</span>
              </Button>
            </form>

            <div className="flex flex-wrap gap-2">
              {fields.map((f) => (
                <div
                  key={f.id}
                  className="flex items-center gap-2 rounded-lg border border-border bg-secondary/50 px-3 py-1.5 text-xs"
                >
                  <span className="font-semibold text-foreground">
                    {f.label}
                  </span>
                  <span className="text-muted-foreground">({f.code})</span>
                  {f.sheetAlias && (
                    <Badge variant="outline">Sheet: {f.sheetAlias}</Badge>
                  )}
                  {!f.isDefault && (
                    <button
                      type="button"
                      onClick={() => deleteFieldMutation.mutate(f.id)}
                      className="cursor-pointer text-destructive hover:opacity-80"
                      title="Xóa trường mở rộng"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* 4. DANH SÁCH BẢN GHI GẦN ĐÂY */}
        <Card>
          <CardHeader>
            <CardTitle>Danh sách bản ghi đang lưu trong hệ thống</CardTitle>
            <CardDescription>
              Bấm &ldquo;Sửa&rdquo; để nạp nhanh dòng dữ liệu lên biểu mẫu chỉnh
              sửa hoặc xóa bản ghi
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Ngày thực hiện</TableHead>
                  <TableHead>Hạng mục dữ liệu</TableHead>
                  <TableHead>Đơn vị xã</TableHead>
                  <TableHead className="text-right">Số thửa</TableHead>
                  <TableHead>Nguồn</TableHead>
                  <TableHead className="text-right">Thao tác</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {records.map((r) => (
                  <TableRow key={r.id}>
                    <TableCell className="tabular-nums">
                      {formatFullDate(r.reportDate)}
                    </TableCell>
                    <TableCell className="font-medium">
                      {r.fieldLabel ?? r.fieldCode}
                    </TableCell>
                    <TableCell>{r.commune || "—"}</TableCell>
                    <TableCell className="text-right font-semibold tabular-nums">
                      {formatNumber(r.parcelCount)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary">{r.source}</Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1.5">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setReportDate(r.reportDate);
                            setFieldCode(r.fieldCode);
                            setCommune(r.commune);
                            setParcelCount(String(r.parcelCount));
                            setNote(r.note ?? "");
                            window.scrollTo({ top: 0, behavior: "smooth" });
                          }}
                        >
                          Sửa
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => deleteRecordMutation.mutate(r.id)}
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
