"use client";

import { Dialog } from "@base-ui/react/dialog";
import { MessageCircle, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRef, useState } from "react";
import { CopilotPanel } from "@/components/copilot/copilot-panel";
import { Button } from "@/components/ui/button";

/** The full-page Copilot. The launcher hides there, so a member never has two chats on one screen. */
export const COPILOT_PAGE = "/copilot";

/** True on /copilot and any page below it. */
export function isCopilotPage(pathname: string | null): boolean {
  return pathname === COPILOT_PAGE || (pathname ?? "").startsWith(`${COPILOT_PAGE}/`);
}

/**
 * The Copilot as a side sheet (C11): a button fixed at the bottom right opens
 * the chat as a slide-over on wider screens and full screen on a phone. The
 * chat stays mounted once opened, so the conversation survives closing the
 * sheet and moving between pages; following a link closes the sheet. Focus
 * moves into the sheet, Escape closes it and focus returns to the button.
 * Mounted from the root layout for signed-in members only (see
 * copilot-launcher-slot.tsx).
 */
export function CopilotLauncher() {
  const pathname = usePathname();
  // Open for one pathname only, so a navigation (a source link in an answer) closes the sheet.
  const [openOn, setOpenOn] = useState<string | null>(null);
  // The chat mounts on first open and then stays mounted while the sheet is closed.
  const [started, setStarted] = useState(false);
  const popupRef = useRef<HTMLDivElement>(null);
  const open = openOn !== null && openOn === pathname;

  function onOpenChange(next: boolean) {
    if (next) setStarted(true);
    setOpenOn(next ? pathname : null);
  }

  // The question field, unless the sheet was opened by touch (that would pop up the keyboard).
  function initialFocus(openType: string) {
    if (openType === "touch") return true;
    return popupRef.current?.querySelector<HTMLInputElement>("input:not([disabled])") ?? true;
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      {!isCopilotPage(pathname) && (
        <Dialog.Trigger
          render={
            <Button
              size="lg"
              className="fixed right-4 bottom-4 z-40 h-11 gap-2 rounded-full px-4 shadow-lg print:hidden"
            />
          }
          data-testid="copilot-launcher"
        >
          <MessageCircle aria-hidden className="size-5" />
          Copilot
        </Dialog.Trigger>
      )}
      <Dialog.Portal keepMounted={started}>
        <Dialog.Backdrop className="fixed inset-0 z-50 bg-foreground/20 transition-opacity duration-200 data-ending-style:opacity-0 data-starting-style:opacity-0 motion-reduce:transition-none dark:bg-background/70" />
        <Dialog.Popup
          ref={popupRef}
          initialFocus={initialFocus}
          className="fixed inset-0 z-50 flex flex-col bg-background shadow-xl outline-none transition-transform duration-200 ease-out data-ending-style:translate-x-full data-starting-style:translate-x-full motion-reduce:transition-none sm:left-auto sm:w-[28rem] sm:border-l md:w-[32rem]"
        >
          <Dialog.Title className="sr-only">Copilot</Dialog.Title>
          <div className="flex justify-end px-3 pt-3">
            <Dialog.Close render={<Button variant="ghost" size="sm" />}>
              <X aria-hidden />
              Close
            </Dialog.Close>
          </div>
          <CopilotPanel className="flex-1 rounded-none pt-1 ring-0" />
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
