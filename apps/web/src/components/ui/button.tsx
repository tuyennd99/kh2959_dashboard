import { cva } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import type { ButtonProps } from '@/types/ui';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex cursor-pointer items-center justify-center gap-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 focus-visible:outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        default:
          'bg-primary text-primary-foreground shadow-2xs hover:bg-accent-hover active:translate-y-[0.5px]',
        primary:
          'bg-primary text-primary-foreground shadow-2xs hover:bg-accent-hover active:translate-y-[0.5px]',
        secondary:
          'border border-input bg-secondary text-secondary-foreground hover:bg-border/60',
        destructive:
          'bg-destructive text-white shadow-2xs hover:opacity-90',
        outline:
          'border border-input bg-card text-foreground shadow-2xs hover:border-accent hover:bg-accent-soft/60',
        ghost:
          'text-muted-foreground hover:bg-secondary hover:text-foreground',
        link: 'text-accent underline-offset-4 hover:underline',
      },
      size: {
        default: 'h-9 px-4 py-2',
        sm: 'h-8 rounded-md px-3 text-xs',
        lg: 'h-10 rounded-lg px-5 text-sm',
        icon: 'size-9 p-0',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  );
}
