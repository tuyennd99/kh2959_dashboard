import { type VariantProps } from "class-variance-authority";
import {
  DateInput as AriaDateInput,
  type DateInputProps as AriaDateInputProps,
  DateSegment as AriaDateSegment,
  type DateSegmentProps as AriaDateSegmentProps,
  composeRenderProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";
import { fieldGroupVariants } from "./field";

function DateSegment({ className, ...props }: AriaDateSegmentProps) {
  return (
    <AriaDateSegment
      className={composeRenderProps(className, (className) =>
        cn(
          "type-literal:px-0 inline rounded p-0.5 caret-transparent outline outline-0",
          "data-[placeholder]:text-muted-foreground data-[focused]:data-[placeholder]:text-accent-foreground data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
          "data-[focused]:bg-accent data-[focused]:text-accent-foreground",
          "data-[invalid]:data-[focused]:bg-destructive data-[invalid]:data-[focused]:data-[placeholder]:text-white data-[invalid]:data-[focused]:text-white data-[invalid]:data-[placeholder]:text-destructive data-[invalid]:text-destructive",
          className,
        ),
      )}
      {...props}
    />
  );
}

type DateInputProps = Omit<AriaDateInputProps, "children"> &
  VariantProps<typeof fieldGroupVariants>;

function DateInput({ className, variant, ...props }: DateInputProps) {
  return (
    <AriaDateInput
      className={composeRenderProps(className, (className) =>
        cn(fieldGroupVariants({ variant }), "text-sm", className),
      )}
      {...props}
    >
      {(segment) => <DateSegment segment={segment} />}
    </AriaDateInput>
  );
}

export { DateInput, DateSegment };
export type { DateInputProps };
