import { Badge } from "@/components/ui/badge";
import { formatDate, PROFILE_STATUS_TEXT } from "@/lib/profile-view/claims";
import type { CompanyHeader as Company } from "@/lib/profile-view/load";

/** Name, links and how the last profiling run went. */
export function CompanyHeader({ company, title }: { company: Company; title?: string }) {
  return (
    <div className="flex flex-col gap-2">
      <h1 className="text-2xl font-semibold">{title ?? company.name}</h1>
      <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
        {company.industry ? <span>{company.industry}</span> : null}
        {company.town ? <span>{company.town}</span> : null}
        {company.website ? (
          <a href={company.website} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
            Website
          </a>
        ) : (
          <span>No website listed</span>
        )}
        <a href={company.memberPage} target="_blank" rel="noreferrer" className="text-primary underline-offset-4 hover:underline">
          BSP member page
        </a>
      </p>
      <p className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Badge variant="outline">{PROFILE_STATUS_TEXT[company.profileStatus ?? "none"]}</Badge>
        {company.lastProfiledAt ? <span>Read from the public pages on {formatDate(company.lastProfiledAt)}</span> : null}
      </p>
      {company.profileNote ? <p className="text-sm text-muted-foreground">{company.profileNote}</p> : null}
    </div>
  );
}
