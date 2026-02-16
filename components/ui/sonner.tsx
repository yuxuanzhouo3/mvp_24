"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner } from "sonner"

type ToasterProps = React.ComponentProps<typeof Sonner>

const Toaster = ({ position, ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const resolvedPosition = position ?? "top-right"

  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      position={resolvedPosition}
      offset={{
        top: "calc(env(safe-area-inset-top) + 12px)",
        right: "12px",
      }}
      className="toaster group"
      toastOptions={{
        classNames: {
          toast:
            "group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",
          description: "group-[.toast]:text-muted-foreground",
          actionButton:
            "group-[.toast]:bg-primary group-[.toast]:text-primary-foreground",
          cancelButton:
            "group-[.toast]:bg-muted group-[.toast]:text-muted-foreground",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
