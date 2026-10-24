import { useState, useRef } from 'react';
import { ChevronLeft, ChevronRight, Search, X, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import type {
  CommuneSummaryItem,
  DailySummaryItem,
  ExternalStatusBreakdown,
  FieldDefinitionDto,
  MetricPair,
} from '@land/shared';

/**
 * Validated categorical palette from dataviz reference (validate_palette.js PASS).
 * Color follows the entity (fieldCode), never its filtered rank.
 */
const FIXED_CODE_SLOT: Record<string, string> = {
  OWNER_MISMATCH: 'var(--series-1)', // #2a78d6 blue
  OUT_OF_LIST_GCN: 'var(--series-2)', // #eb6834 orange
  STANDARDIZED_MAP_SHEETS: 'var(--series-4)', // #eda100 yellow
};

const FALLBACK_SLOTS = [
  'var(--series-5)',
  'var(--series-6)',
  'var(--series-7)',
  'var(--series-8)',
];

export function getFieldColorByCode(code: string, fallbackIndex = 0): string {
  return (
    FIXED_CODE_SLOT[code] ??
    FALLBACK_SLOTS[fallbackIndex % FALLBACK_SLOTS.length]!
  );
}

export function formatNumber(n: number): string {
  return new Intl.NumberFormat('vi-VN').format(n || 0);
}

export function formatShortDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}`;
}

export function formatFullDate(isoDate: string): string {
  const parts = isoDate.split('-');
  if (parts.length !== 3) return isoDate;
  return `${parts[2]}/${parts[1]}/${parts[0]}`;
}

function niceCeiling(maxValue: number): number {
  if (maxValue <= 0) return 100;
  const magnitude = Math.pow(10, Math.floor(Math.log10(maxValue)));
  const normalized = maxValue / magnitude;
  if (normalized <= 1) return magnitude;
  if (normalized <= 2) return 2 * magnitude;
  if (normalized <= 2.5) return 2.5 * magnitude;
  if (normalized <= 5) return 5 * magnitude;
  return 10 * magnitude;
}

export function DailyStackedBarChart({
  byDate,
  fields,
  onSelectDate,
}: {
  byDate: DailySummaryItem[];
  fields: FieldDefinitionDto[];
  onSelectDate?: (dateStr: string) => void;
}) {
  const [activeDate, setActiveDate] = useState<string | null>(null);
  const [rangePreset, setRangePreset] = useState<'7d' | '14d' | '30d' | 'ALL'>('ALL');
  const scrollRef = useRef<HTMLDivElement>(null);

  if (byDate.length === 0) {
    return (
      <div
        className="flex h-56 items-center justify-center rounded-lg border text-sm"
        style={{
          borderColor: 'var(--gridline)',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--surface-1)',
        }}
      >
        Chưa có dữ liệu số thửa theo ngày trong khoảng lọc hiện tại.
      </div>
    );
  }

  const visibleDays = (() => {
    if (rangePreset === '7d') return byDate.slice(-7);
    if (rangePreset === '14d') return byDate.slice(-14);
    if (rangePreset === '30d') return byDate.slice(-30);
    return byDate;
  })();

  const scrollChart = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const amount = direction === 'left' ? -260 : 260;
      scrollRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  };

  const rawMax = Math.max(1, ...visibleDays.map((d) => d.totalParcels));
  const yMax = niceCeiling(rawMax);
  const ticks = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];

  const activeDay =
    visibleDays.find((d) => d.reportDate === activeDate) ??
    visibleDays[visibleDays.length - 1]!;

  return (
    <div className="space-y-4">
      {/* Chart toolbar: Controls & Legend */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        {/* Preset Range Selector & Scroll Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex items-center gap-1 rounded-lg border bg-secondary/50 p-1 text-xs">
            {(['7d', '14d', '30d', 'ALL'] as const).map((preset) => {
              const label =
                preset === '7d'
                  ? '7 ngày'
                  : preset === '14d'
                    ? '14 ngày'
                    : preset === '30d'
                      ? '30 ngày'
                      : 'Tất cả';
              const isSelected = rangePreset === preset;
              return (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setRangePreset(preset)}
                  className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-all"
                  style={{
                    backgroundColor: isSelected ? 'var(--surface-1)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    boxShadow: isSelected ? '0 1px 2px rgba(0, 0, 0, 0.06)' : undefined,
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <span className="rounded-md border bg-card px-2 py-1 text-xs font-medium tabular-nums text-muted-foreground">
            Hiển thị {visibleDays.length}/{byDate.length} ngày
          </span>

          {/* Navigation arrow buttons for horizontal scroll */}
          {visibleDays.length > 8 && (
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => scrollChart('left')}
                className="flex size-7 items-center justify-center rounded-md border bg-card text-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
                title="Cuộn sang trái"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollChart('right')}
                className="flex size-7 items-center justify-center rounded-md border bg-card text-foreground transition-colors hover:bg-accent hover:text-accent-foreground cursor-pointer"
                title="Cuộn sang phải"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {fields.map((f, idx) => (
            <div key={f.code} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-xs"
                style={{ backgroundColor: getFieldColorByCode(f.code, idx) }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Interactive readout bar */}
      {activeDay && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md px-3 py-1.5 text-xs"
          style={{
            backgroundColor: 'var(--surface-page)',
            border: '1px solid var(--border-hairline)',
          }}
        >
          <span className="font-semibold" style={{ color: 'var(--text-primary)' }}>
            Ngày {formatFullDate(activeDay.reportDate)}:
          </span>
          <strong className="tabular-nums font-bold" style={{ color: 'var(--text-primary)' }}>
            {formatNumber(activeDay.totalParcels)} thửa
          </strong>
          <span style={{ color: 'var(--gridline)' }}>|</span>
          {fields.map((f, idx) => {
            const val = activeDay.values[f.code]?.parcelCount ?? 0;
            if (val <= 0) return null;
            return (
              <span key={f.code} className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block h-3 w-0.75 rounded-full"
                  style={{ backgroundColor: getFieldColorByCode(f.code, idx) }}
                />
                <strong className="tabular-nums font-semibold" style={{ color: 'var(--text-primary)' }}>
                  {formatNumber(val)}
                </strong>
                <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
              </span>
            );
          })}
        </div>
      )}

      {/* Plot area with horizontal scroll container */}
      <div className="relative pt-2">
        <div className="grid grid-cols-[56px_1fr] gap-2">
          {/* Y-axis ticks (Fixed on left) */}
          <div
            className="flex h-60 flex-col justify-between pr-1 text-right text-[11px] tabular-nums"
            style={{ color: 'var(--text-muted)' }}
          >
            {ticks.map((t) => (
              <span key={t} className="leading-none">
                {formatNumber(t)}
              </span>
            ))}
          </div>

          {/* Scrollable Columns Canvas */}
          <div ref={scrollRef} className="relative h-60 overflow-x-auto pb-1">
            <div
              className="relative h-full"
              style={{
                minWidth: `${Math.max(visibleDays.length * 48, 400)}px`,
              }}
            >
              {/* Background hairline gridlines */}
              <div className="pointer-events-none absolute inset-0 flex flex-col justify-between">
                {ticks.map((t, i) => (
                  <div
                    key={t}
                    className="w-full"
                    style={{
                      borderBottom:
                        i === ticks.length - 1
                          ? '1px solid var(--baseline)'
                          : '1px solid var(--gridline)',
                    }}
                  />
                ))}
              </div>

              {/* Columns list */}
              <div className="relative z-10 flex h-full items-end justify-around gap-1 px-2">
                {visibleDays.map((day) => {
                  const dayTotal = day.totalParcels;
                  const heightPct =
                    yMax > 0
                      ? Math.max(dayTotal > 0 ? 3 : 0, (dayTotal / yMax) * 100)
                      : 0;
                  const isHovered = activeDay?.reportDate === day.reportDate;

                  const activeSegments = fields
                    .map((f, idx) => ({
                      field: f,
                      color: getFieldColorByCode(f.code, idx),
                      val: day.values[f.code]?.parcelCount ?? 0,
                    }))
                    .filter((s) => s.val > 0);

                  return (
                    <button
                      key={day.reportDate}
                      type="button"
                      onMouseEnter={() => setActiveDate(day.reportDate)}
                      onFocus={() => setActiveDate(day.reportDate)}
                      onClick={() => onSelectDate?.(day.reportDate)}
                      className="group relative flex h-full min-w-9 flex-1 cursor-pointer flex-col items-center justify-end border-0 bg-transparent p-0 focus:outline-none"
                      aria-label={`Ngày ${formatFullDate(day.reportDate)}: ${formatNumber(dayTotal)} thửa`}
                    >
                      {/* Vertical crosshair */}
                      {isHovered && (
                        <div
                          className="pointer-events-none absolute inset-y-0 z-0 w-px"
                          style={{ backgroundColor: 'var(--gridline)' }}
                        />
                      )}

                      {/* Column value cap */}
                      <span
                        className="relative z-10 mb-1.5 rounded px-1 text-[11px] font-semibold tabular-nums transition-transform group-hover:-translate-y-0.5"
                        style={{
                          color: 'var(--text-primary)',
                          backgroundColor: 'var(--surface-1)',
                        }}
                      >
                        {formatNumber(dayTotal)}
                      </span>

                      {/* Bar mark */}
                      <div
                        className="relative z-10 flex w-full max-w-6 flex-col-reverse overflow-hidden rounded-t-sm transition-opacity"
                        style={{
                          height: `${heightPct}%`,
                          gap: '2px',
                          backgroundColor: 'var(--surface-1)',
                          opacity: activeDate && !isHovered ? 0.72 : 1,
                        }}
                      >
                        {activeSegments.map((seg) => {
                          const segPct =
                            dayTotal > 0 ? (seg.val / dayTotal) * 100 : 0;
                          return (
                            <div
                              key={seg.field.code}
                              style={{
                                height: `${segPct}%`,
                                minHeight: '3px',
                                backgroundColor: seg.color,
                              }}
                            />
                          );
                        })}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* X-axis date labels aligned with scroll */}
        <div className="mt-2 grid grid-cols-[56px_1fr] gap-2">
          <div />
          <div className="overflow-x-hidden" style={{ width: '100%' }}>
            <div
              className="flex items-center justify-around gap-1 px-2"
              style={{
                minWidth: `${Math.max(visibleDays.length * 48, 400)}px`,
              }}
            >
              {visibleDays.map((day) => {
                const isHovered = activeDay?.reportDate === day.reportDate;
                return (
                  <div
                    key={day.reportDate}
                    className="min-w-9 flex-1 text-center text-xs tabular-nums"
                    style={{
                      color: isHovered
                        ? 'var(--text-primary)'
                        : 'var(--text-secondary)',
                      fontWeight: isHovered ? 600 : 400,
                    }}
                  >
                    {formatShortDate(day.reportDate)}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function FieldDistributionCard({
  fields,
  totalsByField,
}: {
  fields: FieldDefinitionDto[];
  totalsByField: Record<string, MetricPair>;
}) {
  const totalAll = fields.reduce(
    (acc, f) => acc + (totalsByField[f.code]?.parcelCount ?? 0),
    0,
  );

  return (
    <div className="space-y-3.5">
      {fields.map((f, idx) => {
        const parcels = totalsByField[f.code]?.parcelCount ?? 0;
        const pct =
          totalAll > 0 ? Math.round((parcels / totalAll) * 1000) / 10 : 0;
        const color = getFieldColorByCode(f.code, idx);

        return (
          <div key={f.code} className="space-y-1.5">
            <div className="flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-xs"
                  style={{ backgroundColor: color }}
                />
                <span
                  className="font-medium"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {f.label}
                </span>
              </div>
              <div
                className="tabular-nums"
                style={{ color: 'var(--text-secondary)' }}
              >
                <strong
                  className="font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {formatNumber(parcels)}
                </strong>{' '}
                thửa ({pct}%)
              </div>
            </div>
            {/* Thin horizontal bar <=10px with 4px rounded data-end */}
            <div
              className="h-2.5 w-full overflow-hidden rounded-r-sm"
              style={{ backgroundColor: 'var(--surface-page)' }}
            >
              <div
                className="h-full rounded-r-sm transition-all"
                style={{
                  width: `${Math.max(parcels > 0 ? 2 : 0, pct)}%`,
                  backgroundColor: color,
                }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CommuneHorizontalChart({
  byCommune,
  selectedCommune,
  onSelectCommune,
}: {
  byCommune: CommuneSummaryItem[];
  selectedCommune?: string;
  onSelectCommune?: (commune: string) => void;
}) {
  const [searchQuery, setSearchQuery] = useState('');
  const [limitMode, setLimitMode] = useState<'top10' | 'top20' | 'all'>('all');

  if (byCommune.length === 0) {
    return (
      <div
        className="flex h-40 items-center justify-center rounded-lg border text-sm"
        style={{
          borderColor: 'var(--gridline)',
          color: 'var(--text-secondary)',
        }}
      >
        Chưa có bản ghi gắn theo Xã trong bộ lọc này.
      </div>
    );
  }

  const filtered = byCommune.filter((item) =>
    item.commune.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const displayedCommunes = (() => {
    if (limitMode === 'top10') return filtered.slice(0, 10);
    if (limitMode === 'top20') return filtered.slice(0, 20);
    return filtered;
  })();

  const maxVal = Math.max(1, ...byCommune.map((c) => c.parcelCount));

  return (
    <div className="space-y-3">
      {/* Controls Header: Search & Limit Mode */}
      <div className="space-y-2 border-b border-border pb-2.5">
        <div className="flex items-center justify-between gap-2">
          {/* Quick Search Input */}
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-2.5 top-2 size-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Tìm tên xã..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-md border bg-background py-1 pl-8 pr-7 text-xs text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1.5 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="size-3.5" />
              </button>
            )}
          </div>

          <span className="shrink-0 rounded bg-secondary px-2 py-1 text-[11px] font-medium text-muted-foreground tabular-nums">
            {displayedCommunes.length}/{byCommune.length} xã
          </span>
        </div>

        {/* Limit Toggle Pills */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1 rounded-md bg-secondary/50 p-0.5 text-xs">
            {(['top10', 'top20', 'all'] as const).map((mode) => {
              const label =
                mode === 'top10'
                  ? 'Top 10'
                  : mode === 'top20'
                    ? 'Top 20'
                    : 'Tất cả';
              const isSelected = limitMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setLimitMode(mode)}
                  className="cursor-pointer rounded px-2 py-0.5 text-[11px] font-semibold transition-all"
                  style={{
                    backgroundColor: isSelected ? 'var(--surface-1)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {label}
                </button>
              );
            })}
          </div>

          <span className="text-[11px] text-muted-foreground">
            Bấm vào xã để lọc
          </span>
        </div>
      </div>

      {/* Contained Vertical Scroll Container */}
      <div className="max-h-67.5 overflow-y-auto pr-1 space-y-2">
        {displayedCommunes.length === 0 ? (
          <div className="py-6 text-center text-xs text-muted-foreground">
            Không tìm thấy xã phù hợp với từ khóa.
          </div>
        ) : (
          displayedCommunes.map((item) => {
            const val = item.parcelCount;
            const widthPct = Math.max(val > 0 ? 3 : 0, Math.round((val / maxVal) * 100));
            const isSelected = selectedCommune === item.commune;

            return (
              <button
                key={item.commune}
                type="button"
                onClick={() =>
                  onSelectCommune?.(isSelected ? 'ALL' : item.commune)
                }
                className="group w-full cursor-pointer rounded-lg border p-2 text-left transition-all hover:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                style={{
                  borderColor: isSelected
                    ? 'var(--series-1)'
                    : 'var(--border-hairline)',
                  backgroundColor: isSelected
                    ? 'rgba(42, 120, 214, 0.08)'
                    : 'var(--surface-1)',
                  boxShadow: isSelected ? '0 0 0 1px var(--series-1)' : undefined,
                }}
              >
                <div className="flex items-center justify-between text-xs mb-1">
                  <span className="font-medium text-foreground group-hover:text-primary transition-colors">
                    {item.commune}
                  </span>
                  <span className="tabular-nums text-muted-foreground">
                    <strong className="font-semibold text-foreground">
                      {formatNumber(item.parcelCount)}
                    </strong>{' '}
                    thửa
                  </span>
                </div>

                <div
                  className="h-2 w-full overflow-hidden rounded-r-sm"
                  style={{ backgroundColor: 'var(--surface-page)' }}
                >
                  <div
                    className="h-full rounded-r-sm transition-all"
                    style={{
                      width: `${widthPct}%`,
                      backgroundColor: 'var(--series-1)',
                      opacity: isSelected ? 1 : 0.85,
                    }}
                  />
                </div>
              </button>
            );
          })
        )}
      </div>
    </div>
  );
}

export function ExternalStatusProgressCard({
  title,
  subtitle,
  stats,
}: {
  title: string;
  subtitle: string;
  stats: ExternalStatusBreakdown;
}) {
  const total = Math.max(stats.total, 1);
  const donePct =
    Math.min(100, Math.round((stats.da_chuan / total) * 1000) / 10);
  const pendingPct = Math.min(
    100,
    Math.round((stats.chua_chuan / total) * 1000) / 10,
  );
  const skippedPct = Math.max(
    0,
    Math.round((100 - donePct - pendingPct) * 10) / 10,
  );

  return (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: 'var(--surface-1)',
        border: '1px solid var(--border-hairline)',
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div>
          <h4
            className="text-sm font-semibold"
            style={{ color: 'var(--text-primary)' }}
          >
            {title}
          </h4>
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            {subtitle}
          </p>
        </div>
        <div className="text-right">
          <span
            className="text-xl font-bold"
            style={{ color: 'var(--text-primary)' }}
          >
            {donePct}%
          </span>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            đã chuẩn hóa
          </p>
        </div>
      </div>

      {/* 2px surface gap between stacked segments */}
      <div
        className="mt-3 flex h-3 w-full overflow-hidden rounded-full"
        style={{
          gap: '2px',
          backgroundColor: 'var(--surface-1)',
        }}
      >
        <div
          style={{
            width: `${donePct}%`,
            backgroundColor: 'var(--status-good)',
          }}
          title={`Đã chuẩn: ${formatNumber(stats.da_chuan)}`}
        />
        <div
          style={{
            width: `${pendingPct}%`,
            backgroundColor: 'var(--status-warning)',
          }}
          title={`Chưa chuẩn: ${formatNumber(stats.chua_chuan)}`}
        />
        {skippedPct > 0 && (
          <div
            style={{
              width: `${skippedPct}%`,
              backgroundColor: 'var(--baseline)',
            }}
            title={`Bỏ qua: ${formatNumber(stats.bo_qua)}`}
          />
        )}
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        <div
          className="rounded-lg px-2.5 py-1.5"
          style={{ backgroundColor: 'var(--surface-page)' }}
        >
          <div
            className="flex items-center gap-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: 'var(--status-good)' }}
            />
            <span>Đã chuẩn</span>
          </div>
          <p
            className="mt-0.5 font-semibold tabular-nums"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatNumber(stats.da_chuan)}
          </p>
        </div>
        <div
          className="rounded-lg px-2.5 py-1.5"
          style={{ backgroundColor: 'var(--surface-page)' }}
        >
          <div
            className="flex items-center gap-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: 'var(--status-warning)' }}
            />
            <span>Chưa chuẩn</span>
          </div>
          <p
            className="mt-0.5 font-semibold tabular-nums"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatNumber(stats.chua_chuan)}
          </p>
        </div>
        <div
          className="rounded-lg px-2.5 py-1.5"
          style={{ backgroundColor: 'var(--surface-page)' }}
        >
          <div
            className="flex items-center gap-1.5"
            style={{ color: 'var(--text-secondary)' }}
          >
            <span
              className="size-2 rounded-full"
              style={{ backgroundColor: 'var(--baseline)' }}
            />
            <span>Bỏ qua</span>
          </div>
          <p
            className="mt-0.5 font-semibold tabular-nums"
            style={{ color: 'var(--text-primary)' }}
          >
            {formatNumber(stats.bo_qua)}
          </p>
        </div>
      </div>
    </div>
  );
}

export function WeeklyComparisonLineChart({
  byDate,
}: {
  byDate: DailySummaryItem[];
}) {
  const [hoveredDayIndex, setHoveredDayIndex] = useState<number | null>(null);
  const [displayMode, setDisplayMode] = useState<'daily' | 'cumulative'>('daily');

  if (!byDate || byDate.length === 0) {
    return (
      <div
        className="flex h-56 items-center justify-center rounded-lg border text-sm"
        style={{
          borderColor: 'var(--gridline)',
          color: 'var(--text-secondary)',
          backgroundColor: 'var(--surface-1)',
        }}
      >
        Chưa có dữ liệu so sánh tuần trong khoảng thời gian này.
      </div>
    );
  }

  const WEEKDAY_LABELS = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'];

  const getDayOfWeekIndex = (dateStr: string) => {
    const parts = dateStr.split('-');
    if (parts.length !== 3) return 0;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const day = d.getDay();
    return day === 0 ? 6 : day - 1;
  };

  const sortedDates = [...byDate].sort((a, b) => a.reportDate.localeCompare(b.reportDate));

  // Group into calendar weeks (Monday to Sunday)
  const weekMap = new Map<string, DailySummaryItem[]>();

  sortedDates.forEach((item) => {
    const parts = item.reportDate.split('-');
    if (parts.length !== 3) return;
    const d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    const day = d.getDay();
    const diffToMon = d.getDate() - (day === 0 ? 6 : day - 1);
    const mon = new Date(d);
    mon.setDate(diffToMon);
    const y = mon.getFullYear();
    const m = String(mon.getMonth() + 1).padStart(2, '0');
    const dayNum = String(mon.getDate()).padStart(2, '0');
    const weekKey = `${y}-${m}-${dayNum}`;

    if (!weekMap.has(weekKey)) {
      weekMap.set(weekKey, []);
    }
    weekMap.get(weekKey)!.push(item);
  });

  const weekKeys = Array.from(weekMap.keys());
  const recentWeekKeys = weekKeys.slice(-4);

  const WEEK_STYLES = [
    { color: '#2a78d6', dashArray: undefined, labelPrefix: 'Tuần này' },
    { color: '#eb6834', dashArray: '6 4', labelPrefix: 'Tuần trước' },
    { color: '#eda100', dashArray: '4 3', labelPrefix: '2 tuần trước' },
    { color: '#888888', dashArray: '2 3', labelPrefix: '3 tuần trước' },
  ];

  const weeks = recentWeekKeys.reverse().map((wKey, idx) => {
    const items = weekMap.get(wKey) || [];
    const style = WEEK_STYLES[idx] || { color: '#888888', labelPrefix: `Tuần ${idx + 1}` };

    const days: (DailySummaryItem | null)[] = [null, null, null, null, null, null, null];
    let total = 0;

    items.forEach((item) => {
      const dayIdx = getDayOfWeekIndex(item.reportDate);
      days[dayIdx] = item;
      total += item.totalParcels;
    });

    const startDate = items[0] ? formatShortDate(items[0].reportDate) : '';
    const endDate = items[items.length - 1] ? formatShortDate(items[items.length - 1].reportDate) : '';
    const dateRange = startDate && endDate ? `(${startDate} - ${endDate})` : '';

    return {
      id: wKey,
      label: idx === 0 ? `Tuần này ${dateRange}` : idx === 1 ? `Tuần trước ${dateRange}` : `${style.labelPrefix} ${dateRange}`,
      color: style.color,
      dashArray: style.dashArray,
      days,
      total,
    };
  });

  const getWeekValues = (days: (DailySummaryItem | null)[]): number[] => {
    let sum = 0;
    return days.map((d) => {
      const val = d ? d.totalParcels : 0;
      if (displayMode === 'cumulative') {
        sum += val;
        return sum;
      }
      return val;
    });
  };

  const weekSeries = weeks.map((w) => ({
    week: w,
    values: getWeekValues(w.days),
  }));

  const allValues = weekSeries.flatMap((s) => s.values);
  const rawMax = Math.max(1, ...allValues);
  const yMax = niceCeiling(rawMax);
  const ticks = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];

  const svgWidth = 1000;
  const svgHeight = 260;
  const paddingLeft = 50;
  const paddingRight = 15;
  const paddingTop = 20;
  const paddingBottom = 32;

  const chartWidth = svgWidth - paddingLeft - paddingRight;
  const chartHeight = svgHeight - paddingTop - paddingBottom;

  const getX = (dayIdx: number) => paddingLeft + (dayIdx / 6) * chartWidth;
  const getY = (val: number) => paddingTop + chartHeight - (val / yMax) * chartHeight;

  const currentWeekTotal = weeks[0]?.total ?? 0;
  const prevWeekTotal = weeks[1]?.total ?? 0;
  const weekDiff = currentWeekTotal - prevWeekTotal;
  const weekPctChange = prevWeekTotal > 0 ? ((weekDiff / prevWeekTotal) * 100).toFixed(1) : null;

  return (
    <div className="space-y-4">
      {/* Header Controls & Summary Stats */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Daily vs Cumulative Toggle */}
          <div className="flex items-center gap-1 rounded-lg border bg-secondary/50 p-1 text-xs">
            <button
              type="button"
              onClick={() => setDisplayMode('daily')}
              className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-all"
              style={{
                backgroundColor: displayMode === 'daily' ? 'var(--surface-1)' : 'transparent',
                color: displayMode === 'daily' ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: displayMode === 'daily' ? '0 1px 2px rgba(0, 0, 0, 0.06)' : undefined,
              }}
            >
              Sản lượng theo ngày
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode('cumulative')}
              className="cursor-pointer rounded-md px-2.5 py-1 text-xs font-semibold transition-all"
              style={{
                backgroundColor: displayMode === 'cumulative' ? 'var(--surface-1)' : 'transparent',
                color: displayMode === 'cumulative' ? 'var(--text-primary)' : 'var(--text-secondary)',
                boxShadow: displayMode === 'cumulative' ? '0 1px 2px rgba(0, 0, 0, 0.06)' : undefined,
              }}
            >
              Cộng dồn tuần
            </button>
          </div>

          {/* Comparison Delta Badge */}
          {weekPctChange !== null && (
            <span
              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold tabular-nums"
              style={{
                backgroundColor: Number(weekPctChange) >= 0 ? 'rgba(12, 163, 12, 0.1)' : 'rgba(208, 59, 59, 0.1)',
                color: Number(weekPctChange) >= 0 ? 'var(--delta-up-good)' : 'var(--status-critical)',
              }}
            >
              {Number(weekPctChange) >= 0 ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownRight className="size-3.5" />
              )}
              {Number(weekPctChange) >= 0 ? '+' : ''}
              {weekPctChange}% so với tuần trước
            </span>
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-3 text-xs">
          {weeks.map((w) => (
            <div key={w.id} className="flex items-center gap-1.5">
              <span
                className="inline-block h-0.5 w-4 rounded-full"
                style={{
                  backgroundColor: w.color,
                  borderTop: w.dashArray ? `2px dashed ${w.color}` : undefined,
                }}
              />
              <span className="font-medium" style={{ color: 'var(--text-secondary)' }}>
                {w.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* SVG Line Chart */}
      <div className="relative w-full pt-1">
        <svg
          viewBox={`0 0 ${svgWidth} ${svgHeight}`}
          preserveAspectRatio="none"
          className="w-full h-65 select-none"
        >
          {/* Y Axis Gridlines & Labels */}
          {ticks.map((t) => {
            const y = getY(t);
            return (
              <g key={t}>
                <line
                  x1={paddingLeft}
                  y1={y}
                  x2={svgWidth - paddingRight}
                  y2={y}
                  stroke="var(--gridline)"
                  strokeDasharray={t === 0 ? undefined : '2 2'}
                  strokeWidth={t === 0 ? 1.5 : 1}
                />
                <text
                  x={paddingLeft - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize="11"
                  fill="var(--text-muted)"
                  className="tabular-nums"
                >
                  {formatNumber(t)}
                </text>
              </g>
            );
          })}

          {/* X Axis Labels */}
          {WEEKDAY_LABELS.map((label, idx) => {
            const x = getX(idx);
            const isHovered = hoveredDayIndex === idx;
            return (
              <g key={label}>
                {/* Vertical hover line background */}
                {isHovered && (
                  <rect
                    x={x - (chartWidth / 14)}
                    y={paddingTop}
                    width={chartWidth / 7}
                    height={chartHeight}
                    fill="var(--surface-1)"
                    opacity="0.5"
                    rx="4"
                  />
                )}
                <text
                  x={x}
                  y={svgHeight - 8}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight={isHovered ? '600' : '400'}
                  fill={isHovered ? 'var(--text-primary)' : 'var(--text-secondary)'}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* Line series for each week */}
          {weekSeries.map(({ week, values }) => {
            const points = values.map((val, idx) => ({
              x: getX(idx),
              y: getY(val),
              val,
              dayItem: week.days[idx],
            }));

            const pathD = points
              .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
              .join(' ');

            return (
              <g key={week.id}>
                {/* Smooth stroke line */}
                <path
                  d={pathD}
                  fill="none"
                  stroke={week.color}
                  strokeWidth={week.id === weeks[0]?.id ? '3' : '2'}
                  strokeDasharray={week.dashArray}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  opacity={hoveredDayIndex !== null ? 0.9 : 1}
                />

                {/* Data points */}
                {points.map((p, idx) => {
                  const isHovered = hoveredDayIndex === idx;
                  return (
                    <circle
                      key={idx}
                      cx={p.x}
                      cy={p.y}
                      r={isHovered ? '6' : '4'}
                      fill="var(--surface-1)"
                      stroke={week.color}
                      strokeWidth={isHovered ? '3' : '2'}
                      className="transition-all cursor-pointer"
                      onMouseEnter={() => setHoveredDayIndex(idx)}
                      onMouseLeave={() => setHoveredDayIndex(null)}
                    >
                      <title>{`${week.label} - ${WEEKDAY_LABELS[idx]}: ${formatNumber(p.val)} thửa`}</title>
                    </circle>
                  );
                })}
              </g>
            );
          })}

          {/* Hover hit areas per weekday column */}
          {WEEKDAY_LABELS.map((_, idx) => {
            const x = getX(idx);
            return (
              <rect
                key={idx}
                x={x - (chartWidth / 12)}
                y={paddingTop}
                width={chartWidth / 6}
                height={chartHeight}
                fill="transparent"
                className="cursor-pointer"
                onMouseEnter={() => setHoveredDayIndex(idx)}
                onMouseLeave={() => setHoveredDayIndex(null)}
              />
            );
          })}
        </svg>
      </div>

      {/* Interactive Tooltip readout bar when hovering a day of week */}
      {hoveredDayIndex !== null && (
        <div
          className="flex flex-wrap items-center gap-3 rounded-md px-3 py-2 text-xs border"
          style={{
            backgroundColor: 'var(--surface-page)',
            borderColor: 'var(--border-hairline)',
          }}
        >
          <span className="font-semibold text-foreground">
            {WEEKDAY_LABELS[hoveredDayIndex]}:
          </span>
          <div className="flex flex-wrap items-center gap-3">
            {weekSeries.map(({ week, values }) => {
              const val = values[hoveredDayIndex] ?? 0;
              const rawDay = week.days[hoveredDayIndex];
              return (
                <div key={week.id} className="flex items-center gap-1.5">
                  <span
                    className="inline-block size-2 rounded-full"
                    style={{ backgroundColor: week.color }}
                  />
                  <span className="text-muted-foreground">{week.label.split(' ')[0]}:</span>
                  <strong className="font-bold text-foreground tabular-nums">
                    {formatNumber(val)}
                  </strong>
                  {rawDay && (
                    <span className="text-[10px] text-muted-foreground">
                      ({formatShortDate(rawDay.reportDate)})
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
