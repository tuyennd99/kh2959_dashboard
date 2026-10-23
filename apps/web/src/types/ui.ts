import type { ButtonHTMLAttributes, InputHTMLAttributes } from 'react';
import type { VariantProps } from 'class-variance-authority';
import type { buttonVariants } from '@/components/ui/button';

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

export type InputProps = InputHTMLAttributes<HTMLInputElement>;
