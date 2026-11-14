"use client";

import { useEffect, useState } from "react";

const EVENT = "vsp:announce";

/**
 * Say a short status to screen readers from anywhere on the page, also from a
 * control that is about to disappear (an accepted suggestion). Needs one
 * <Announcer /> on the page.
 */
export function announce(message: string) {
  window.dispatchEvent(new CustomEvent<string>(EVENT, { detail: message }));
}

/** A hidden live region that reads out what announce() sends. Always in the page, so the change is heard. */
export function Announcer() {
  const [message, setMessage] = useState("");
  useEffect(() => {
    const onAnnounce = (event: Event) => setMessage((event as CustomEvent<string>).detail);
    window.addEventListener(EVENT, onAnnounce);
    return () => window.removeEventListener(EVENT, onAnnounce);
  }, []);
  return (
    <p role="status" className="sr-only">
      {message}
    </p>
  );
}
