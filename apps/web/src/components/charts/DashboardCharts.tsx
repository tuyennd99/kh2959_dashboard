import { useState } from 'react';
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
}: {
  byDate: DailySummaryItem[];
  fields: FieldDefinitionDto[];
}) {
  const [activeDate, setActiveDate] = useState<string | null>(null);

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

  const rawMax = Math.max(1, ...byDate.map((d) => d.totalParcels));
  const yMax = niceCeiling(rawMax);
  const ticks = [yMax, Math.round(yMax * 0.75), Math.round(yMax * 0.5), Math.round(yMax * 0.25), 0];

  const activeDay =
    byDate.find((d) => d.reportDate === activeDate) ??
    byDate[byDate.length - 1]!;

  return (
    <div className="space-y-4">
      {/* Legend always present for >=2 series; text uses ink tokens, never series color */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4 text-xs">
          {fields.map((f, idx) => (
            <div key={f.code} className="flex items-center gap-1.5">
              <span
                className="inline-block size-2.5 rounded-[2px]"
                style={{ backgroundColor: getFieldColorByCode(f.code, idx) }}
              />
              <span style={{ color: 'var(--text-secondary)' }}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* Interactive readout bar (crosshair / hover summary for all series at selected date) */}
        {activeDay && (
          <div
            className="flex flex-wrap items-center gap-3 rounded-md px-3 py-1.5 text-xs"
            style={{
              backgroundColor: 'var(--surface-page)',
              border: '1px solid var(--border-hairline)',
            }}
          >
            <span
              className="font-semibold"
              style={{ color: 'var(--text-primary)' }}
            >
              Ngày {formatFullDate(activeDay.reportDate)}:
            </span>
            <strong
              className="tabular-nums font-bold"
              style={{ color: 'var(--text-primary)' }}
            >
              {formatNumber(activeDay.totalParcels)} thửa
            </strong>
            <span style={{ color: 'var(--gridline)' }}>|</span>
            {fields.map((f, idx) => {
              const val = activeDay.values[f.code]?.parcelCount ?? 0;
              if (val <= 0) return null;
              return (
                <span key={f.code} className="inline-flex items-center gap-1.5">
                  <span
                    className="inline-block h-3 w-[3px] rounded-full"
                    style={{
                      backgroundColor: getFieldColorByCode(f.code, idx),
                    }}
                  />
                  <strong
                    className="tabular-nums font-semibold"
                    style={{ color: 'var(--text-primary)' }}
                  >
                    {formatNumber(val)}
                  </strong>
                  <span style={{ color: 'var(--text-secondary)' }}>
                    {f.label}
                  </span>
                </span>
              );
            })}
          </div>
        )}
      </div>

      {/* Plot area + X-axis band sized together so labels never clip or scroll vertically */}
      <div className="relative pt-2">
        <div className="grid grid-cols-[56px_1fr] gap-2">
          {/* Y-axis ticks */}
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

          {/* Plot canvas with solid hairline gridlines */}
          <div className="relative h-60">
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

            {/* Columns: hit target is wide (>=36px), bar mark itself is <=24px with 4px top radius and 2px surface gap */}
            <div className="relative z-10 flex h-full items-end justify-around gap-1 px-2">
              {byDate.map((day) => {
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
                    className="group relative flex h-full min-w-[36px] flex-1 cursor-pointer flex-col items-center justify-end border-0 bg-transparent p-0 focus:outline-none"
                    aria-label={`Ngày ${formatFullDate(day.reportDate)}: ${formatNumber(dayTotal)} thửa`}
                  >
                    {/* Vertical crosshair hairline behind mark & label */}
                    {isHovered && (
                      <div
                        className="pointer-events-none absolute inset-y-0 z-0 w-px"
                        style={{ backgroundColor: 'var(--gridline)' }}
                      />
                    )}

                    {/* Direct cap label on column top with surface background so crosshair never cuts text */}
                    <span
                      className="relative z-10 mb-1.5 rounded px-1 text-[11px] font-semibold tabular-nums transition-transform group-hover:-translate-y-0.5"
                      style={{
                        color: 'var(--text-primary)',
                        backgroundColor: 'var(--surface-1)',
                      }}
                    >
                      {formatNumber(dayTotal)}
                    </span>

                    {/* Bar mark: <=24px wide, 4px rounded top, square at baseline, 2px surface gap */}
                    <div
                      className="relative z-10 flex w-full max-w-[24px] flex-col-reverse overflow-hidden rounded-t-[4px] transition-opacity"
                      style={{
                        height: `${heightPct}%`,
                        gap: '2px',
                        backgroundColor: 'var(--surface-1)',
                        opacity:
                          activeDate && !isHovered ? 0.72 : 1,
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

        {/* X-axis date labels */}
        <div className="mt-2 grid grid-cols-[56px_1fr] gap-2">
          <div />
          <div className="flex items-center justify-around gap-1 px-2">
            {byDate.map((day) => {
              const isHovered = activeDay?.reportDate === day.reportDate;
              return (
                <div
                  key={day.reportDate}
                  className="min-w-[36px] flex-1 text-center text-xs tabular-nums"
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
                  className="size-2.5 shrink-0 rounded-[2px]"
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
              className="h-2.5 w-full overflow-hidden rounded-r-[4px]"
              style={{ backgroundColor: 'var(--surface-page)' }}
            >
              <div
                className="h-full rounded-r-[4px] transition-all"
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
}: {
  byCommune: CommuneSummaryItem[];
}) {
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

  const maxVal = Math.max(1, ...byCommune.map((c) => c.parcelCount));

  return (
    <div className="space-y-3">
      {byCommune.map((item) => {
        const val = item.parcelCount;
        const widthPct = Math.max(val > 0 ? 3 : 0, Math.round((val / maxVal) * 100));
        return (
          <div key={item.commune} className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span
                className="font-medium"
                style={{ color: 'var(--text-primary)' }}
              >
                {item.commune}
              </span>
              <span
                className="tabular-nums"
                style={{ color: 'var(--text-secondary)' }}
              >
                <strong
                  className="font-semibold"
                  style={{ color: 'var(--text-primary)' }}
                >
                  {formatNumber(item.parcelCount)}
                </strong>{' '}
                thửa
              </span>
            </div>
            {/* Single series nominal comparison -> slot 1 color (#2a78d6) for every bar */}
            <div
              className="h-2.5 w-full overflow-hidden rounded-r-[4px]"
              style={{ backgroundColor: 'var(--surface-page)' }}
            >
              <div
                className="h-full rounded-r-[4px] transition-all"
                style={{
                  width: `${widthPct}%`,
                  backgroundColor: 'var(--series-1)',
                }}
              />
            </div>
          </div>
        );
      })}
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
