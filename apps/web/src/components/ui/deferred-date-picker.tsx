import { parseDate, type CalendarDate } from "@internationalized/date";
import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type DatePickerComponent = typeof import("./date-picker").JollyDatePicker;

interface DeferredDatePickerProps {
  label: string;
  className?: string;
  isRequired?: boolean;
  value: CalendarDate | null;
  onChange: (date: CalendarDate | null) => void;
}

export function DeferredDatePicker({
  label,
  className,
  isRequired,
  value,
  onChange,
}: DeferredDatePickerProps) {
  const id = useId();
  const [focused, setFocused] = useState(false);
  const [DatePicker, setDatePicker] = useState<DatePickerComponent | null>(
    null,
  );

  function handleFocus() {
    setFocused(true);
    if (DatePicker) return;
    void import("./date-picker")
      .then(({ JollyDatePicker }) => setDatePicker(() => JollyDatePicker))
      .catch((error: unknown) =>
        console.error("Could not load date picker.", error),
      );
  }

  if (DatePicker && !focused) {
    return (
      <DatePicker
        label={label}
        className={className}
        isRequired={isRequired}
        value={value}
        onChange={onChange}
      />
    );
  }

  return (
    <div className={`flex flex-col gap-2 ${className ?? ""}`}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        required={isRequired}
        value={value?.toString() ?? ""}
        onChange={(event) =>
          onChange(event.target.value ? parseDate(event.target.value) : null)
        }
        onFocus={handleFocus}
        onBlur={() => setFocused(false)}
      />
    </div>
  );
}
