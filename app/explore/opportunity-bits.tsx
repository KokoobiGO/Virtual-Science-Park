import { Badge } from "@/components/ui/badge";
import type { MatchInfo } from "@/lib/explore/filter";

/** The product rule: anything the team entered by hand is labelled. */
export function SimulatedBadge() {
  return (
    <Badge variant="outline" title="Hand-entered by the team, not read from a live source.">
      Simulated
    </Badge>
  );
}

/** For a member: this opportunity is in the company's own ranked matches. */
export function MatchNote({ match }: { match: MatchInfo }) {
  return (
    <p className="rounded-lg bg-muted px-3 py-2 text-sm">
      <span className="font-medium">Potential match for you, number {match.position} in your ranking.</span>{" "}
      {match.why ?? <span className="text-muted-foreground">Not judged yet, so there is no reason written down.</span>}
    </p>
  );
}

/** The external link to the source page. */
export function SourceLink({ url, title, className }: { url: string; title: string; className?: string }) {
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className={`font-medium underline-offset-4 hover:underline ${className ?? ""}`}>
      {title}
    </a>
  );
}
