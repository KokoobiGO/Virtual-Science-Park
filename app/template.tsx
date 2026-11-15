/**
 * Wraps every page inside <main>. Next gives a template a new key when the
 * top-level route changes, so the page fades in on each navigation (the
 * layout around it, header and footer, stays put). Reduced motion turns the
 * fade off (globals.css).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <div className="flex flex-1 flex-col animate-fade">{children}</div>;
}
