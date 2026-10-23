import type { TextareaHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export function Textarea({
  className,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        'border-input bg-card text-foreground placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-ring/25 flex min-h-24 w-full rounded-lg border px-3 py-2 text-sm shadow-2xs transition-colors focus-visible:ring-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
        className,
      )}
      {...props}
    />
  );
}
