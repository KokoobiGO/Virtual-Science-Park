import type { ReactNode } from "react";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { formatDate } from "@/lib/profile-view/claims";
import type { CompanyHeader as Company } from "@/lib/profile-view/load";

/**
 * Name, then one quiet line: industry, town, links and how the last profiling
 * run went. Words in the reader's language (C19); name, industry and town as stored.
 */
export function CompanyHeader({ company, title, locale = DEFAULT_LOCALE }: { company: Company; title?: string; locale?: Locale }) {
  const t = createTranslator(locale, "profile");
  const newTab = createTranslator(locale, "common")("opensInNewTab");
  const parts: ReactNode[] = [];
  if (company.industry) parts.push(company.industry);
  if (company.town) parts.push(company.town);
  parts.push(
    company.website ? (
      <ExternalLink href={company.website} newTab={newTab}>
        {t("header.website")}
      </ExternalLink>
    ) : (
      t("header.noWebsite")
    ),
  );
  parts.push(
    <ExternalLink href={company.memberPage} newTab={newTab}>
      {t("header.memberPage")}
    </ExternalLink>,
  );
  // A profiled company shows when it was read; any other state says what it is.
  parts.push(
    company.profileStatus === "profiled" && company.lastProfiledAt
      ? t.rich("list.read", { date: <time dateTime={company.lastProfiledAt.toISOString()}>{formatDate(company.lastProfiledAt, locale)}</time> })
      : t(`status.${company.profileStatus ?? "none"}`),
  );

  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-title break-words">{title ?? company.name}</h1>
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-muted-foreground">
        {parts.map((part, i) => (
          <span key={i} className="inline-flex gap-x-2">
            {i > 0 ? <span aria-hidden>&middot;</span> : null}
            <span>{part}</span>
          </span>
        ))}
      </p>
      {company.profileNote ? <p className="max-w-prose text-sm break-words text-muted-foreground">{company.profileNote}</p> : null}
    </div>
  );
}

function ExternalLink({ href, newTab, children }: { href: string; newTab: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="underline underline-offset-4 hover:text-foreground">
      {children}
      <span className="sr-only">{newTab}</span>
    </a>
  );
}
