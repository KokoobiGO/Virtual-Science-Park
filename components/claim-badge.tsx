import { cn } from "cn";
import { CircleDashed, PencilLine, Quote, Sparkles, UserCheck, type LucideIcon } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { MESSAGES } from "@/lib/i18n/translate";
import type { ClaimStatus } from "@/lib/schemas";

type ClaimStatusMeta = {
  label: string;
  /** One sentence for a legend or a tooltip. */
  description: string;
  variant: "success" | "warning" | "muted" | "info";
  icon: LucideIcon;
};

const LOOK: Record<ClaimStatus, Pick<ClaimStatusMeta, "variant" | "icon">> = {
  stated: { variant: "success", icon: Quote },
  inferred: { variant: "warning", icon: Sparkles },
  missing: { variant: "muted", icon: CircleDashed },
  user_confirmed: { variant: "info", icon: UserCheck },
  user_corrected: { variant: "info", icon: PencilLine },
};

/** The word and the sentence for a status in one language (messages/*.json, `claimStatus`). */
export function claimStatusText(status: ClaimStatus, locale: Locale = DEFAULT_LOCALE): { label: string; description: string } {
  return MESSAGES[locale].claimStatus[status];
}

/**
 * How each claim status looks (C1), in English. Every status has its own
 * colour, its own icon and its own word, so the colour never carries the
 * meaning alone.
 */
export const CLAIM_STATUS_META: Record<ClaimStatus, ClaimStatusMeta> = Object.fromEntries(
  (Object.keys(LOOK) as ClaimStatus[]).map((status) => [status, { ...claimStatusText(status), ...LOOK[status] }]),
) as Record<ClaimStatus, ClaimStatusMeta>;

/** The order a legend shows the statuses in. */
export const CLAIM_STATUSES = Object.keys(CLAIM_STATUS_META) as ClaimStatus[];

/**
 * A badge that says where a profile value comes from: Stated, Inferred, Missing, or the member's own word.
 * `locale` picks the language (C19); English when left out.
 */
export function ClaimBadge({
  status,
  label,
  locale = DEFAULT_LOCALE,
  className,
}: {
  status: ClaimStatus;
  label?: string;
  locale?: Locale;
  className?: string;
}) {
  const { icon: Icon, variant } = LOOK[status];
  const text = claimStatusText(status, locale);
  return (
    <Badge variant={variant} title={text.description} data-claim-status={status} className={cn(className)}>
      <Icon aria-hidden data-icon="inline-start" />
      {label ?? text.label}
    </Badge>
  );
}
