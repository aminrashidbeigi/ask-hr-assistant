"use client";

import { Dialog } from "@base-ui/react/dialog";
import { XIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const Sheet = Dialog.Root;

/** Slide-over: right-hand panel from md up, bottom sheet on small screens. */
function SheetContent({
  title,
  description,
  className,
  children,
}: {
  title: ReactNode;
  description?: ReactNode;
  className?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-[2px] transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0" />
      <Dialog.Popup
        className={cn(
          "fixed z-50 flex flex-col bg-popover text-popover-foreground shadow-2xl outline-none transition-transform duration-300 ease-out",
          "inset-x-0 bottom-0 max-h-[85dvh] md:top-0 md:h-dvh rounded-t-3xl border-t data-ending-style:translate-y-full data-starting-style:translate-y-full",
          "md:inset-y-0 md:right-0 md:left-auto md:bottom-auto md:max-h-none md:w-[26rem] md:rounded-l-3xl md:rounded-tr-none md:border-t-0 md:border-l md:data-ending-style:translate-x-full md:data-ending-style:translate-y-0 md:data-starting-style:translate-x-full md:data-starting-style:translate-y-0",
          className,
        )}
      >
        <div className="flex items-start justify-between gap-3 border-b px-5 py-4">
          <div className="min-w-0">
            <Dialog.Title className="text-base font-semibold">{title}</Dialog.Title>
            {description && (
              <Dialog.Description className="mt-0.5 text-xs text-muted-foreground">{description}</Dialog.Description>
            )}
          </div>
          <Dialog.Close
            aria-label="Close"
            className="-mr-1.5 inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <XIcon className="size-4" />
          </Dialog.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </Dialog.Popup>
    </Dialog.Portal>
  );
}

export { Sheet, SheetContent };
