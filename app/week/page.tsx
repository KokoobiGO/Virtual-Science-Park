import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth";
import { mondayOf } from "@/lib/cards/week";
import { withUserDb } from "@/lib/db/user";
import { NAV } from "@/lib/navigation";
import { weekLabel } from "@/lib/week/format";
import { loadWeek } from "@/lib/week/load";
import { WeekCard } from "./week-card";

export const metadata = { title: "Your week" };

export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Your week</h1>
        <p className="text-muted-foreground">
          This week&apos;s picks for your company: funding calls, testbeds and events, each with why it fits, a next step
          and its source. Every card is a potential match, not a decision: check the source or ask BSP staff.
        </p>
      </div>
      <Suspense fallback={<p className="text-muted-foreground">Loading your cards...</p>}>
        <WeekContent />
      </Suspense>
    </section>
  );
}

/** Reads the session and the company's cards, so it streams in behind the Suspense boundary above. */
async function WeekContent() {
  const viewer = await getViewer();
  if (!viewer) redirect("/sign-in?next=/week");
  if (viewer.role !== "member" || !viewer.companyId) return <StaffNotice />;

  const companyId = viewer.companyId;
  const week = await withUserDb(viewer.claims, (tx) => loadWeek(tx, { companyId, userId: viewer.userId }));
  if (!week.weekOf || !week.cards.length) return <NoCards />;

  const now = new Date();
  const thisWeek = mondayOf(now);
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold">Week of {weekLabel(week.weekOf)}</h2>
        {week.weekOf !== thisWeek ? (
          <p className="text-sm text-muted-foreground">
            This week&apos;s cards are not ready yet, so these are the latest ones, from the week of {weekLabel(week.weekOf)}.
          </p>
        ) : null}
      </div>
      <ol className="flex flex-col gap-4">
        {week.cards.map((card) => (
          <li key={card.id}>
            <WeekCard card={card} now={now} />
          </li>
        ))}
      </ol>
    </div>
  );
}

function NoCards() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No cards yet</CardTitle>
        <CardDescription>
          Your cards are built every Monday morning from the opportunities ranked for your company. None have been built for
          your company yet.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" render={<Link href="/profile" />} nativeButton={false}>
          Check your company profile
        </Button>
        <Button variant="outline" size="sm" render={<Link href="/explore" />} nativeButton={false}>
          Explore opportunities
        </Button>
      </CardContent>
    </Card>
  );
}

/** Staff accounts have no company, so there are no cards to show. */
function StaffNotice() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>No company on a staff account</CardTitle>
        <CardDescription>
          &quot;Your week&quot; shows one member company&apos;s cards. BSP staff accounts have no company, so there is
          nothing to show here. Use the staff tools instead.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {NAV.staff.map((item) => (
          <Button key={item.href} variant="outline" size="sm" render={<Link href={item.href} />} nativeButton={false}>
            {item.label}
          </Button>
        ))}
      </CardContent>
    </Card>
  );
}
