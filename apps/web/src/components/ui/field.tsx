import { cva, type VariantProps } from "class-variance-authority";
import {
  FieldError as AriaFieldError,
  type FieldErrorProps as AriaFieldErrorProps,
  Group as AriaGroup,
  type GroupProps as AriaGroupProps,
  Label as AriaLabel,
  type LabelProps as AriaLabelProps,
  Text as AriaText,
  type TextProps as AriaTextProps,
  composeRenderProps,
} from "react-aria-components";
import { cn } from "@/lib/utils";

const labelVariants = cva([
  "text-sm font-medium leading-none",
  "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-70",
  "group-data-[invalid]:text-destructive",
]);

function Label({ className, ...props }: AriaLabelProps) {
  return <AriaLabel className={cn(labelVariants(), className)} {...props} />;
}

function FieldError({ className, ...props }: AriaFieldErrorProps) {
  return (
    <AriaFieldError
      className={cn("text-sm font-medium text-destructive", className)}
      {...props}
    />
  );
}

const fieldGroupVariants = cva("", {
  variants: {
    variant: {
      default:
        "relative flex h-10 w-full items-center overflow-hidden rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background data-[focus-within]:outline-none data-[focus-within]:ring-2 data-[focus-within]:ring-ring data-[focus-within]:ring-offset-2 data-[disabled]:opacity-50",
      ghost: "",
    },
  },
  defaultVariants: { variant: "default" },
});

interface FieldGroupProps
  extends AriaGroupProps, VariantProps<typeof fieldGroupVariants> {}

function FieldGroup({ className, variant, ...props }: FieldGroupProps) {
  return (
    <AriaGroup
      className={composeRenderProps(className, (className) =>
        cn(fieldGroupVariants({ variant }), className),
      )}
      {...props}
    />
  );
}

function FormDescription({ className, ...props }: AriaTextProps) {
  return (
    <AriaText
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
      slot="description"
    />
  );
}

export {
  FieldError,
  FieldGroup,
  FormDescription,
  Label,
  fieldGroupVariants,
  labelVariants,
};
