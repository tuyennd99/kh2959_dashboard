import { useState, type ChangeEvent } from "react";
import { getLocalTimeZone, parseDate, today } from "@internationalized/date";
import { useForm } from "@tanstack/react-form";
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
const DEFAULT_TWO_TIER_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1SOaLTftRmFtYw937R6NIIHewdDEFJG3sSUf0azaSkNI/edit?gid=0#gid=0";
const DEFAULT_VNLIS_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/1GYM2mqpc8vWB9EAgxcCSzuLFqKbRhOYB/edit?gid=1037546126#gid=1037546126";

export function ManagePage() {
  const session = useSessionStore((s) => s.session);
  const queryClient = useQueryClient();

  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "error";
    text: string;
  } | null>(null);

  const todayIso = today(getLocalTimeZone()).toString();
  const syncForm = useForm({
    defaultValues: {
      sheetUrl: DEFAULT_SHEET_URL,
      twoTierSheetUrl: DEFAULT_TWO_TIER_SHEET_URL,
      vnlisSheetUrl: DEFAULT_VNLIS_SHEET_URL,
      replaceExisting: true,
    },
    onSubmit: ({ value }) =>
      syncMutation.mutate({
        sheetUrl: value.sheetUrl.trim() || undefined,
        twoTierSheetUrl: value.twoTierSheetUrl.trim() || undefined,
        vnlisSheetUrl: value.vnlisSheetUrl.trim() || undefined,
        replaceExisting: value.replaceExisting,
      }),
  });
  const manualForm = useForm({
    defaultValues: {
      reportDate: todayIso,
      fieldCode: "STANDARDIZED_MAP_SHEETS",
      commune: "",
      parcelCount: "0",
      note: "",
    },
    onSubmit: ({ value }) =>
      upsertMutation.mutate({
        reportDate: value.reportDate,
        fieldCode: value.fieldCode,
        commune: value.commune.trim(),
        bookCount: 0,
        parcelCount: Number(value.parcelCount) || 0,
        note: value.note.trim() || undefined,
      }),
  });
  const csvForm = useForm({
    defaultValues: { csvText: "" },
    onSubmit: ({ value }) =>
      csvMutation.mutate({ csvContent: value.csvText, replaceExisting: false }),
  });
  const createFieldForm = useForm({
    defaultValues: { code: "", label: "", alias: "" },
    onSubmit: ({ value }) =>
      createFieldMutation.mutate({
        code: value.code,
        label: value.label,
        sheetAlias: value.alias || undefined,
      }),
  });

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
      queryClient.invalidateQueries({ queryKey: ["sheet-modules"] }),
    ]);
  };

  const syncMutation = useMutation({
    mutationFn: syncGoogleSheetApi,
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
    mutationFn: upsertLandRecordApi,
    onSuccess: async () => {
      setStatusMessage({
        type: "success",
        text: "Đã lưu số thửa thành công.",
      });
      manualForm.setFieldValue("parcelCount", "0");
      manualForm.setFieldValue("note", "");
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
    mutationFn: importCsvApi,
    onSuccess: async (log) => {
      setStatusMessage({
        type: "success",
        text:
          log.message || `Đã nhập thành công ${log.recordsSynced} dòng từ CSV.`,
      });
      csvForm.setFieldValue("csvText", "");
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
    mutationFn: createFieldDefinitionApi,
    onSuccess: async (created) => {
      setStatusMessage({
        type: "success",
        text: `Đã thêm trường dữ liệu mới: ${created.label} (${created.code})`,
      });
      createFieldForm.reset();
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
        csvForm.setFieldValue("csvText", reader.result);
      }
    };
    reader.readAsText(file, "utf-8");
  };

  return (
    <div className="viz-root min-h-screen">
      <TopNav />

      <main className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6">
        {statusMessage && (
          <div
            className={`rounded-lg border px-4 py-3 text-sm font-medium ${statusMessage.type === "success"
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
          <CardContent>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void syncForm.handleSubmit();
              }}
              className="space-y-3"
            >
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="sync-sheet-url">
                    Link Google Sheet 1: Xử lý dữ liệu bóc tách được từ tool
                  </Label>
                  <syncForm.Field name="sheetUrl">
                    {(field) => (
                      <Input
                        id="sync-sheet-url"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Dán đường dẫn Google Sheet xử lý dữ liệu bóc tách..."
                      />
                    )}
                  </syncForm.Field>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sync-two-tier-url">
                    Link Google Sheet 2: Quy đổi tờ thửa từ 3 cấp sang 2 cấp
                  </Label>
                  <syncForm.Field name="twoTierSheetUrl">
                    {(field) => (
                      <Input
                        id="sync-two-tier-url"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Dán đường dẫn Google Sheet quy đổi tờ thửa từ 3 cấp sang 2 cấp..."
                      />
                    )}
                  </syncForm.Field>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="sync-vnlis-url">
                    Link Google Sheet 3: Trích xuất, ký số, đồng bộ VNLIS & Đối khớp dân cư (2 sheet)
                  </Label>
                  <syncForm.Field name="vnlisSheetUrl">
                    {(field) => (
                      <Input
                        id="sync-vnlis-url"
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                        placeholder="Dán đường dẫn Google Sheet đồng bộ VNLIS & Dân cư..."
                      />
                    )}
                  </syncForm.Field>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs text-muted-foreground">
                <syncForm.Field name="replaceExisting">
                  {(field) => (
                    <label
                      htmlFor="replace-existing-sheet"
                      className="flex items-center gap-2"
                    >
                      <input
                        id="replace-existing-sheet"
                        type="checkbox"
                        checked={field.state.value}
                        onChange={(e) => field.handleChange(e.target.checked)}
                      />
                      <span>
                        Làm mới toàn bộ bản ghi đồng bộ từ Google Sheet (giữ
                        nguyên bản ghi nhập tay)
                      </span>
                    </label>
                  )}
                </syncForm.Field>
                <div className="flex flex-wrap items-center gap-3">
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
                  <Button
                    type="submit"
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
              </div>
            </form>
          </CardContent>
        </Card>

        {/* 2. NHẬP LIỆU TRỰC TIẾP & UPLOAD CSV */}
        {/* <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Nhập hoặc cập nhật số thửa thủ công</CardTitle>
              <CardDescription>
                Nhập số lượng cho &ldquo;Số lượng tờ bản đồ đã chuẩn hóa&rdquo;
                hoặc bất kỳ hạng mục nào theo ngày và xã.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void manualForm.handleSubmit();
                }}
                className="space-y-3.5"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <manualForm.Field name="reportDate">
                    {(field) => (
                      <DeferredDatePicker
                        label="Ngày thực hiện"
                        isRequired
                        className="w-full"
                        value={parseDate(field.state.value)}
                        onChange={(date) =>
                          field.handleChange(date?.toString() ?? "")
                        }
                      />
                    )}
                  </manualForm.Field>
                  <div className="space-y-1.5">
                    <Label>Hạng mục dữ liệu</Label>
                    <manualForm.Field name="fieldCode">
                      {(field) => (
                        <Select
                          value={field.state.value}
                          onValueChange={field.handleChange}
                        >
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
                      )}
                    </manualForm.Field>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-commune">Đơn vị xã (tùy chọn)</Label>
                    <manualForm.Field name="commune">
                      {(field) => (
                        <Input
                          id="manual-commune"
                          placeholder="VD: Độc Lập, Quảng Uyên..."
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      )}
                    </manualForm.Field>
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="manual-parcel-count">Số thửa</Label>
                    <manualForm.Field name="parcelCount">
                      {(field) => (
                        <Input
                          id="manual-parcel-count"
                          type="number"
                          min={0}
                          required
                          value={field.state.value}
                          onChange={(e) => field.handleChange(e.target.value)}
                        />
                      )}
                    </manualForm.Field>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="manual-note">Ghi chú (tùy chọn)</Label>
                  <manualForm.Field name="note">
                    {(field) => (
                      <Input
                        id="manual-note"
                        placeholder="Ghi chú bổ sung..."
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                    )}
                  </manualForm.Field>
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
            <CardContent>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void csvForm.handleSubmit();
                }}
                className="space-y-3.5"
              >
                <div>
                  <Input
                    type="file"
                    accept=".csv,text/csv"
                    onChange={handleFileUpload}
                  />
                </div>
                <csvForm.Field name="csvText">
                  {(field) => (
                    <>
                      <Textarea
                        rows={5}
                        placeholder="Hoặc dán trực tiếp nội dung CSV vào đây..."
                        value={field.state.value}
                        onChange={(e) => field.handleChange(e.target.value)}
                      />
                      <Button
                        type="submit"
                        variant="outline"
                        className="gap-2"
                        disabled={
                          !field.state.value.trim() || csvMutation.isPending
                        }
                      >
                        <Upload className="size-4" />
                        <span>
                          {csvMutation.isPending
                            ? "Đang xử lý CSV..."
                            : "Nhập dữ liệu từ CSV"}
                        </span>
                      </Button>
                    </>
                  )}
                </csvForm.Field>
              </form>
            </CardContent>
          </Card>
        </div> */}

        {/* 3. QUẢN LÝ TRƯỜNG DỮ LIỆU MỞ RỘNG */}
        {/* <Card>
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
              onSubmit={(e) => {
                e.preventDefault();
                void createFieldForm.handleSubmit();
              }}
              className="grid grid-cols-1 gap-3 sm:grid-cols-4"
            >
              <createFieldForm.Field name="code">
                {(field) => (
                  <Input
                    placeholder="Mã trường (VD: CHUYEN_MUC_DICH)"
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                )}
              </createFieldForm.Field>
              <createFieldForm.Field name="label">
                {(field) => (
                  <Input
                    placeholder="Tên hiển thị trên bảng theo dõi"
                    required
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                )}
              </createFieldForm.Field>
              <createFieldForm.Field name="alias">
                {(field) => (
                  <Input
                    placeholder="Tên nhãn tương ứng trong Sheet"
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                  />
                )}
              </createFieldForm.Field>
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
        </Card> */}

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
                            manualForm.setFieldValue(
                              "reportDate",
                              r.reportDate,
                            );
                            manualForm.setFieldValue("fieldCode", r.fieldCode);
                            manualForm.setFieldValue("commune", r.commune);
                            manualForm.setFieldValue(
                              "parcelCount",
                              String(r.parcelCount),
                            );
                            manualForm.setFieldValue("note", r.note ?? "");
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
