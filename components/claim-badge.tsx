import { cn } from "cn";
import { CircleDashed, PencilLine, Quote, Sparkles, UserCheck, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { ClaimStatus } from "@/lib/schemas";

type ClaimStatusMeta = {
  label: string;
  /** One sentence for a legend or a tooltip. */
  description: string;
  variant: "success" | "warning" | "muted" | "info";
  icon: LucideIcon;
};

/**
 * How each claim status looks (C1). Every status has its own colour, its own
 * icon and its own word, so the colour never carries the meaning alone.
 */
export const CLAIM_STATUS_META: Record<ClaimStatus, ClaimStatusMeta> = {
  stated: {
    label: "Stated",
    description: "The company's own page says this; a quote from the page backs it.",
    variant: "success",
    icon: Quote,
  },
  inferred: {
    label: "Inferred",
    description: "Worked out from the pages, not said in so many words.",
    variant: "warning",
    icon: Sparkles,
  },
  missing: {
    label: "Missing",
    description: "The public pages do not say this.",
    variant: "muted",
    icon: CircleDashed,
  },
  user_confirmed: {
    label: "Confirmed by member",
    description: "The member checked this and said it is right.",
    variant: "info",
    icon: UserCheck,
  },
  user_corrected: {
    label: "Corrected by member",
    description: "The member changed this value.",
    variant: "info",
    icon: PencilLine,
  },
};

/** The order a legend shows the statuses in. */
export const CLAIM_STATUSES = Object.keys(CLAIM_STATUS_META) as ClaimStatus[];

/** A badge that says where a profile value comes from: Stated, Inferred, Missing, or the member's own word. */
export function ClaimBadge({ status, label, className }: { status: ClaimStatus; label?: string; className?: string }) {
  const meta = CLAIM_STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant} title={meta.description} data-claim-status={status} className={cn(className)}>
      <Icon aria-hidden data-icon="inline-start" />
      {label ?? meta.label}
    </Badge>
  );
}
