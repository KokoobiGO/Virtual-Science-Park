import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import type { Viewer } from "@/lib/auth";
import { withUserDb } from "@/lib/db/user";
import type { Locale } from "@/lib/i18n/config";
import { createTranslator } from "@/lib/i18n/translate";
import { formatDate } from "@/lib/profile-view/claims";
import { loadCompanyList } from "@/lib/profile-view/load";

/** For BSP staff: every member company, each linking to its public profile (C5). Words in the reader's language (C19). */
export async function CompanyList({ viewer, locale }: { viewer: Viewer; locale: Locale }) {
  const companies = await withUserDb(viewer.claims, (tx) => loadCompanyList(tx));
  const t = createTranslator(locale, "profile");
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">{t("list.title")}</h1>
        <p className="text-muted-foreground">{t("list.intro", { count: companies.length })}</p>
      </div>
      {companies.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-muted-foreground">
          {t.rich("list.empty", {
            link: (chunk) => (
              <Link href="/staff/checks" className="text-primary underline-offset-4 hover:underline">
                {chunk}
              </Link>
            ),
          })}
        </p>
      ) : (
        <ul className="stagger flex flex-col gap-2">
          {companies.map((c) => (
            <li key={c.slug} className="lift flex flex-wrap items-center gap-x-4 gap-y-1 rounded-xl border bg-card px-4 py-3 shadow-card">
              <Link href={`/profile/${c.slug}`} className="min-w-0 font-medium break-words text-primary underline-offset-4 hover:underline">
                {c.name}
              </Link>
              <span className="text-sm text-muted-foreground">{[c.industry, c.town].filter(Boolean).join(", ")}</span>
              <span className="ml-auto flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                {c.lastProfiledAt ? (
                  <span>
                    {t.rich("list.read", {
                      date: <time dateTime={c.lastProfiledAt.toISOString()}>{formatDate(c.lastProfiledAt, locale)}</time>,
                    })}
                  </span>
                ) : null}
                <Badge variant={c.profileStatus === "profiled" ? "secondary" : "outline"}>{t(`status.${c.profileStatus ?? "none"}`)}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
