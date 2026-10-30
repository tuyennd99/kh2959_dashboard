import * as React from "react";
import {
  format,
  isValid,
  parse,
  setHours,
  setMinutes,
  startOfToday,
} from "date-fns";
import { Calendar as CalendarIcon, X as XIcon } from "lucide-react";
import { DayPicker } from "react-day-picker";
import { vi } from "react-day-picker/locale";
import { Popover } from "radix-ui";
import "react-day-picker/style.css";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

type DatePickerProps = {
  value?: Date | null;
  onChange?: (date: Date | null) => void;
  /** Thêm cột giờ:phút, format 'dd/MM/yyyy HH:mm' */
  showTime?: boolean;
  placeholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  /** Preset chọn nhanh, cột trái như antd. value gọi lúc click. */
  presets?: { label: string; value: () => Date }[];
  disabledDate?: (date: Date) => boolean;
  /** Check từng mốc giờ/phút (nhận datetime ứng viên đầy đủ). true = disable. */
  disabledTime?: (date: Date) => boolean;
  className?: string;
  id?: string;
};

function TimeColumn({
  count,
  selected,
  disabled,
  onSelect,
}: {
  count: number;
  selected?: number;
  disabled?: (n: number) => boolean;
  onSelect: (n: number) => void;
}) {
  // ponytail: không scroll-into-view khi mở, thêm ref + scrollIntoView nếu cần
  return (
    // ponytail: stopPropagation cho wheel không tới document listener của Dialog scroll-lock (react-remove-scroll), nếu không cột giờ không scroll được trong dialog
    <div
      data-time-col
      className="h-82 w-14 overflow-y-auto border-l p-1"
      onWheel={(e) => e.stopPropagation()}
    >
      {Array.from({ length: count }, (_, n) => (
        <button
          key={n}
          type="button"
          disabled={disabled?.(n)}
          className={cn(
            "block w-full rounded-md py-1 text-center text-sm transition-colors hover:bg-(--ds-blue-100)",
            selected === n &&
              "bg-[var(--ds-blue-900)] text-white hover:bg-[var(--ds-blue-700)]",
            "disabled:pointer-events-none disabled:opacity-40",
          )}
          onClick={() => onSelect(n)}
        >
          {String(n).padStart(2, "0")}
        </button>
      ))}
    </div>
  );
}

function DatePicker({
  value = null,
  onChange,
  showTime = false,
  placeholder,
  disabled = false,
  allowClear = true,
  presets,
  disabledDate,
  disabledTime,
  className,
  id,
}: DatePickerProps) {
  const fmt = showTime ? "dd/MM/yyyy HH:mm" : "dd/MM/yyyy";
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState(value ? format(value, fmt) : "");
  const [month, setMonth] = React.useState<Date>(value ?? startOfToday());
  const anchorRef = React.useRef<HTMLDivElement>(null);

  /* eslint-disable react-hooks/set-state-in-effect -- sync controlled value into editable text/month drafts */
  React.useEffect(() => {
    setText(value ? format(value, fmt) : "");
    if (value) setMonth(value);
  }, [value, fmt]);
  /* eslint-enable react-hooks/set-state-in-effect */

  const base = () => value ?? startOfToday();

  const parseText = (t: string) => {
    const d = parse(t.trim(), fmt, new Date());
    if (!isValid(d) || disabledDate?.(d)) return null;
    if (showTime && disabledTime?.(d)) return null;
    return d;
  };

  /** Commit giá trị + sync text ngay (effect không chạy khi value không đổi tham chiếu) */
  const apply = (d: Date | null) => {
    onChange?.(d);
    setText(d ? format(d, fmt) : "");
  };

  const revert = () => setText(value ? format(value, fmt) : "");

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      if (!text.trim()) {
        apply(null);
        setOpen(false);
        return;
      }
      const d = parseText(text);
      if (d) {
        apply(d);
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      revert();
      setOpen(false);
    }
  };

  const handleBlur = () => {
    if (!text.trim()) {
      apply(null);
      return;
    }
    const d = parseText(text);
    if (d) apply(d);
    else revert();
  };

  const handleSelect = (day: Date | undefined, triggerDate: Date) => {
    const selectedDay = day ?? triggerDate;
    if (showTime) {
      const b = base();
      apply(setMinutes(setHours(selectedDay, b.getHours()), b.getMinutes()));
    } else {
      apply(selectedDay);
      setOpen(false);
    }
  };

  const showClear = allowClear && !disabled && !!value;

  return (
    <Popover.Root open={open} onOpenChange={setOpen}>
      <Popover.Anchor asChild>
        <div ref={anchorRef} className={cn("group relative", className)}>
          <Input
            id={id}
            value={text}
            placeholder={
              placeholder ?? (showTime ? "Chọn ngày giờ" : "Chọn ngày")
            }
            disabled={disabled}
            autoComplete="off"
            className={showClear ? "pr-16" : "pr-8"}
            onChange={(e) => setText(e.target.value)}
            onMouseDown={() => setOpen(true)}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
          />
          <button
            type="button"
            aria-label="Mở lịch"
            disabled={disabled}
            className={cn(
              "absolute top-1/2 right-2.5 -translate-y-1/2",
              showClear && "right-9",
            )}
            onClick={() => setOpen(true)}
          >
            <CalendarIcon className="text-muted-foreground size-4" />
          </button>
          {showClear && (
            <button
              type="button"
              aria-label="Xóa"
              className="absolute top-1/2 right-2.5 -translate-y-1/2"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => apply(null)}
            >
              <XIcon className="text-muted-foreground hover:text-foreground size-4" />
            </button>
          )}
        </div>
      </Popover.Anchor>
      <Popover.Content
        className="z-50 w-auto rounded-md border bg-popover p-3 text-popover-foreground shadow-md"
        align="start"
        onOpenAutoFocus={(e) => e.preventDefault()}
        onInteractOutside={(e) => {
          if (anchorRef.current?.contains(e.target as Node)) e.preventDefault();
        }}
      >
        <div>
          <div className="flex">
            {!!presets?.length && (
              <div className="flex flex-col gap-1 border-r p-2">
                {presets.map((preset) => (
                  <Button
                    key={preset.label}
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="justify-start"
                    onClick={() => {
                      apply(preset.value());
                      setOpen(false);
                    }}
                  >
                    {preset.label}
                  </Button>
                ))}
              </div>
            )}
            <DayPicker
              mode="single"
              month={month}
              onMonthChange={setMonth}
              selected={value ?? undefined}
              onSelect={handleSelect}
              disabled={disabledDate}
              locale={vi}
              autoFocus
            />
            {showTime && (
              <>
                <TimeColumn
                  count={24}
                  selected={value?.getHours()}
                  disabled={(h) => !!disabledTime?.(setHours(base(), h))}
                  onSelect={(h) => apply(setHours(base(), h))}
                />
                <TimeColumn
                  count={60}
                  selected={value?.getMinutes()}
                  disabled={(m) => !!disabledTime?.(setMinutes(base(), m))}
                  onSelect={(m) => apply(setMinutes(base(), m))}
                />
              </>
            )}
          </div>
          {showTime && (
            <div className="flex items-center justify-between border-t p-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => apply(new Date())}
              >
                Bây giờ
              </Button>
              <Button
                type="button"
                size="sm"
                onClick={() => {
                  if (!value) apply(base());
                  setOpen(false);
                }}
              >
                OK
              </Button>
            </div>
          )}
        </div>
      </Popover.Content>
    </Popover.Root>
  );
}

export { DatePicker };
export type { DatePickerProps };
