import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Viewer } from "@/lib/auth";
import { withUserDb } from "@/lib/db/user";
import { formatDate, PROFILE_STATUS_TEXT } from "@/lib/profile-view/claims";
import { loadCompanyList } from "@/lib/profile-view/load";

/** For BSP staff: every member company, each linking to its public profile (C5). */
export async function CompanyList({ viewer }: { viewer: Viewer }) {
  const companies = await withUserDb(viewer.claims, (tx) => loadCompanyList(tx));
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Company profiles</h1>
        <p className="text-muted-foreground">
          The public profile of each of the {companies.length} member companies: what their own pages say, with the
          quotes. Private fields and priorities stay with each company.
        </p>
      </div>
      <ul className="divide-y rounded-xl border">
        {companies.map((c) => (
          <li key={c.slug} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3">
            <Link href={`/profile/${c.slug}`} className="font-medium text-primary underline-offset-4 hover:underline">
              {c.name}
            </Link>
            <span className="text-sm text-muted-foreground">{[c.industry, c.town].filter(Boolean).join(", ")}</span>
            <span className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
              {c.lastProfiledAt ? <span>{formatDate(c.lastProfiledAt)}</span> : null}
              <Badge variant={c.profileStatus === "profiled" ? "secondary" : "outline"}>
                {PROFILE_STATUS_TEXT[c.profileStatus ?? "none"]}
              </Badge>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
