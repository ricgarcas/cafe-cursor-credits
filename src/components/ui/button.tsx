import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:ring-2 focus-visible:ring-ring/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background aria-invalid:ring-destructive/30",
  {
    variants: {
      variant: {
        // Solid: black in light, white in dark (matches Cursor "Download for macOS")
        default:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        // Secondary: outlined pill like "Sign in" / "Contact sales"
        outline:
          "border border-border bg-transparent text-foreground hover:bg-muted",
        // Brand action — link-style for inline highlights. Monochromatic: reads
        // as body text with an underline on hover.
        brand:
          "bg-transparent text-foreground hover:underline underline-offset-4 px-0",
        // Filled brand (used to be orange; now just the primary solid button).
        brandFilled:
          "bg-primary text-primary-foreground hover:bg-primary/90",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "bg-transparent hover:bg-muted text-foreground",
        link: "text-primary underline-offset-4 hover:underline px-0",
      },
      size: {
        default: "h-10 px-5 py-2",
        sm: "h-8 px-4 text-[13px]",
        lg: "h-12 px-7 text-[15px]",
        icon: "size-10",
        "icon-sm": "size-8",
        "icon-lg": "size-12",
      },
      shape: {
        pill: "rounded-full",
        rounded: "rounded-lg",
        square: "rounded-none",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
      shape: "pill",
    },
  }
)

function Button({
  className,
  variant,
  size,
  shape,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, shape, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
