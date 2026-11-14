import { Badge } from "@/components/ui/badge";
import { formatDate, PROFILE_STATUS_TEXT } from "@/lib/profile-view/claims";
import type { CompanyHeader as Company } from "@/lib/profile-view/load";

/** Name, links and how the last profiling run went. */
export function CompanyHeader({ company, title }: { company: Company; title?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold break-words">{title ?? company.name}</h1>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {company.industry ? <span>{company.industry}</span> : null}
        {company.town ? <span>{company.town}</span> : null}
        {company.website ? (
          <ExternalLink href={company.website}>Website</ExternalLink>
        ) : (
          <span>No website listed</span>
        )}
        <ExternalLink href={company.memberPage}>BSP member page</ExternalLink>
      </p>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{PROFILE_STATUS_TEXT[company.profileStatus ?? "none"]}</Badge>
        {company.lastProfiledAt ? (
          <span>
            Read from the public pages on{" "}
            <time dateTime={company.lastProfiledAt.toISOString()}>{formatDate(company.lastProfiledAt)}</time>
          </span>
        ) : null}
      </p>
      {company.profileNote ? <p className="text-sm break-words text-muted-foreground">{company.profileNote}</p> : null}
    </div>
  );
}

function ExternalLink({ href, children }: { href: string; children: string }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
      {children}
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}
