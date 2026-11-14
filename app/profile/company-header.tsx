import { Badge } from "@/components/ui/badge";
import { DEFAULT_LOCALE, type Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { formatDate } from "@/lib/profile-view/claims";
import type { CompanyHeader as Company } from "@/lib/profile-view/load";

/** Name, links and how the last profiling run went. Words in the reader's language (C19); name, industry and town as stored. */
export function CompanyHeader({ company, title, locale = DEFAULT_LOCALE }: { company: Company; title?: string; locale?: Locale }) {
  const t = createTranslator(locale, "profile");
  const newTab = createTranslator(locale, "common")("opensInNewTab");
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold break-words">{title ?? company.name}</h1>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {company.industry ? <span>{company.industry}</span> : null}
        {company.town ? <span>{company.town}</span> : null}
        {company.website ? (
          <ExternalLink href={company.website} newTab={newTab}>
            {t("header.website")}
          </ExternalLink>
        ) : (
          <span>{t("header.noWebsite")}</span>
        )}
        <ExternalLink href={company.memberPage} newTab={newTab}>
          {t("header.memberPage")}
        </ExternalLink>
      </p>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{t(`status.${company.profileStatus ?? "none"}`)}</Badge>
        {company.lastProfiledAt ? (
          <span>
            {t.rich("header.readOn", {
              date: <time dateTime={company.lastProfiledAt.toISOString()}>{formatDate(company.lastProfiledAt, locale)}</time>,
            })}
          </span>
        ) : null}
      </p>
      {company.profileNote ? <p className="text-sm break-words text-muted-foreground">{company.profileNote}</p> : null}
    </div>
  );
}

function ExternalLink({ href, newTab, children }: { href: string; newTab: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
      {children}
      <span className="sr-only">{newTab}</span>
    </a>
  );
}
