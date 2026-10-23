import type { ComponentProps } from 'react';
import { Tabs as TabsPrimitive } from 'radix-ui';
import { cn } from '@/lib/utils';

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      data-slot="tabs-list"
      className={cn(
        'border-border bg-secondary text-muted-foreground inline-flex h-9 items-center justify-center rounded-lg border p-1',
        className,
      )}
      {...props}
    />
  );
}

export function TabsTrigger({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      data-slot="tabs-trigger"
      className={cn(
        'focus-visible:ring-ring data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:border-border/80 inline-flex cursor-pointer items-center justify-center rounded-md border border-transparent px-3 py-1 text-xs font-semibold whitespace-nowrap transition-all hover:text-foreground focus-visible:ring-2 focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 data-[state=active]:shadow-2xs',
        className,
      )}
      {...props}
    />
  );
}

export function TabsContent({
  className,
  ...props
}: ComponentProps<typeof TabsPrimitive.Content>) {
  return (
    <TabsPrimitive.Content
      data-slot="tabs-content"
      className={cn(
        'focus-visible:ring-ring mt-3 focus-visible:ring-2 focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );
}
