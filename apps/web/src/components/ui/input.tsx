import { forwardRef } from 'react';
import type { InputProps } from '@/types/ui';
import { cn } from '@/lib/utils';

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, type, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      type={type}
      data-slot="input"
      className={cn(
        'border-input bg-card text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/25 flex h-9 w-full rounded-lg border px-3 py-1.5 text-sm shadow-2xs transition-colors file:border-0 file:bg-transparent file:text-xs file:font-semibold focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        type === 'date' && 'cursor-pointer tabular-nums',
        className,
      )}
      {...props}
    />
  );
});
