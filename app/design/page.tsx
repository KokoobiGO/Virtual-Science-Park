import { ArrowRight, Bookmark } from "lucide-react";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { CLAIM_STATUSES, CLAIM_STATUS_META, ClaimBadge } from "@/components/claim-badge";
import { DataStatusLegend, DataStatusPanel } from "@/components/data-status-panel";
import { DataStatusLabel } from "@/components/data-status-label";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NavMenu } from "@/components/ui/nav-menu";
import { NAV } from "@/lib/navigation";
import type { SourceHealth } from "@/lib/sources/health";

export const metadata: Metadata = { title: "Design system" };

/** C1: every component and badge on one page. Static: no data is read. */
export default function DesignPage() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-12 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-sm font-medium text-primary">For the team</p>
        <h1 className="text-title md:text-display">Design system</h1>
        <p className="max-w-prose text-muted-foreground">
          The Blue Science Park theme and the shared components. Colours are tokens in <Code>app/globals.css</Code>,
          so screens built with <Code>bg-background</Code>, <Code>text-muted-foreground</Code> or{" "}
          <Code>bg-primary</Code> follow the theme in light and dark mode. Press Tab to see the focus ring.
        </p>
      </header>

      <Section title="Colours" note="Each status tone is a text colour plus a soft background. Always pair it with words.">
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {SWATCHES.map((s) => (
            <li key={s.name} className="flex flex-col gap-1.5">
              <span className={`h-14 rounded-lg ring-1 ring-foreground/10 ${s.className}`} aria-hidden />
              <span className="font-mono text-xs">{s.name}</span>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Type scale" note="Geist. Page hero, page title and section heading have their own utilities.">
        <div className="flex flex-col gap-3">
          <TypeRow name="text-display">
            <p className="text-display">Funding that fits</p>
          </TypeRow>
          <TypeRow name="text-title">
            <p className="text-title">Your week</p>
          </TypeRow>
          <TypeRow name="text-heading">
            <p className="text-heading">Calls closing soon</p>
          </TypeRow>
          <TypeRow name="text-base">
            <p className="text-base">Body text for paragraphs and descriptions.</p>
          </TypeRow>
          <TypeRow name="text-sm">
            <p className="text-sm">Default text inside cards, lists and forms.</p>
          </TypeRow>
          <TypeRow name="text-xs muted">
            <p className="text-xs text-muted-foreground">Captions, source keys, small print.</p>
          </TypeRow>
          <TypeRow name="font-mono">
            <p className="font-mono text-sm">vinnova · eu_funding</p>
          </TypeRow>
        </div>
      </Section>

      <Section title="Buttons" note="components/ui/button. As a link: render={<Link href=… />} nativeButton={false}.">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <Button>Default</Button>
            <Button variant="secondary">Secondary</Button>
            <Button variant="outline">Outline</Button>
            <Button variant="ghost">Ghost</Button>
            <Button variant="destructive">Destructive</Button>
            <Button variant="link">Link</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button size="xs">Extra small</Button>
            <Button size="sm">Small</Button>
            <Button>Default</Button>
            <Button size="lg">Large</Button>
            <Button size="icon" aria-label="Save">
              <Bookmark />
            </Button>
            <Button>
              Open your week
              <ArrowRight data-icon="inline-end" />
            </Button>
            <Button disabled>Disabled</Button>
          </div>
        </div>
      </Section>

      <Section title="Badges" note="components/ui/badge. The last five are the soft status tones.">
        <div className="flex flex-wrap items-center gap-2">
          <Badge>Default</Badge>
          <Badge variant="secondary">Secondary</Badge>
          <Badge variant="outline">Outline</Badge>
          <Badge variant="destructive">Destructive</Badge>
          <Badge variant="ghost">Ghost</Badge>
          <Badge variant="link">Link</Badge>
          <Badge variant="success">Success</Badge>
          <Badge variant="warning">Warning</Badge>
          <Badge variant="info">Info</Badge>
          <Badge variant="simulated">Simulated</Badge>
          <Badge variant="muted">Muted</Badge>
        </div>
      </Section>

      <Section title="Claim badges" note="components/claim-badge: <ClaimBadge status=… />. Colour, icon and word differ for each.">
        <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          {CLAIM_STATUSES.map((status) => (
            <div key={status} className="flex flex-col items-start gap-1">
              <dt>
                <ClaimBadge status={status} />
              </dt>
              <dd className="text-muted-foreground">{CLAIM_STATUS_META[status].description}</dd>
            </div>
          ))}
        </dl>
      </Section>

      <Section
        title="Data status labels"
        note="components/data-status-label: <DataStatusLabel kind=… date=… />. Simulated and cached data is always labelled."
      >
        <div className="flex flex-col gap-5">
          <div className="flex flex-wrap items-center gap-2">
            <DataStatusLabel kind="live" date={SAMPLE_NOW} />
            <DataStatusLabel kind="stale" date={new Date("2026-11-09T02:00:00Z")} />
            <DataStatusLabel kind="stale" />
            <DataStatusLabel kind="cached" date={new Date("2026-11-10T02:00:00Z")} />
            <DataStatusLabel kind="cached" />
            <DataStatusLabel kind="simulated" />
            <DataStatusLabel kind="hand_entered" />
          </div>
          <DataStatusLegend />
        </div>
      </Section>

      <Section title="Cards" note="components/ui/card. A raised surface on the page background: a hairline ring and a soft shadow.">
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle>Card title</CardTitle>
              <CardDescription>A short description under the title.</CardDescription>
            </CardHeader>
            <CardContent>Content goes here, in text-sm.</CardContent>
          </Card>
          <Card size="sm">
            <CardHeader>
              <CardTitle>Small card</CardTitle>
              <CardDescription>size=&quot;sm&quot; for dense lists.</CardDescription>
            </CardHeader>
            <CardContent>Tighter spacing.</CardContent>
          </Card>
          <ExampleMatchCard />
        </div>
      </Section>

      <Section title="Form fields" note="components/ui/input and label. aria-invalid shows the error state.">
        <div className="grid max-w-xl gap-4 sm:grid-cols-2">
          <div className="flex flex-col gap-2">
            <Label htmlFor="design-email">Email</Label>
            <Input id="design-email" type="email" placeholder="name@company.se" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="design-invalid">With an error</Label>
            <Input id="design-invalid" defaultValue="not an email" aria-invalid aria-describedby="design-invalid-msg" />
            <p id="design-invalid-msg" className="text-xs text-destructive">
              Enter an email address.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="design-disabled">Disabled</Label>
            <Input id="design-disabled" disabled defaultValue="Read only" />
          </div>
        </div>
      </Section>

      <Section
        title="Data status panel"
        note="components/data-status-panel. These are sample rows, not the real status: that is on the Data status page (/sources)."
      >
        <DataStatusPanel entries={SAMPLE_SOURCES} description="Sample rows for this page. Not the real status." headingLevel={3} />
      </Section>

      <Section
        title="Menus"
        note="components/ui/nav-menu, as the header shows it to each role. Below the md width the links fold into a Menu button."
      >
        <div className="flex flex-col gap-4">
          {(["member", "staff"] as const).map((role) => (
            <div
              key={role}
              className="flex min-h-14 flex-wrap items-center gap-x-6 gap-y-1 rounded-xl bg-card px-4 py-2 shadow-card ring-1 ring-foreground/10"
            >
              <span className="font-heading font-semibold">Virtual Science Park</span>
              <NavMenu
                items={NAV[role].map(({ href, label }) => ({ href, label }))}
                label={`Example ${role} menu`}
                extra={
                  <>
                    <Badge variant={role === "staff" ? "default" : "secondary"}>{role === "staff" ? "BSP staff" : "Member"}</Badge>
                    <span className="text-sm text-muted-foreground">{role === "staff" ? "staff@demo.vsp.test" : "Example AB"}</span>
                    <Button variant="outline" size="sm" disabled>
                      Sign out
                    </Button>
                  </>
                }
              />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Light and dark" note="The site follows the device setting. A .light or .dark class forces one mode.">
        <div className="grid gap-4 md:grid-cols-2">
          {(["light", "dark"] as const).map((mode) => (
            <div key={mode} className={`${mode} flex flex-col gap-4 rounded-xl bg-background p-5 text-foreground ring-1 ring-foreground/10`}>
              <p className="text-sm font-medium capitalize">{mode}</p>
              <ExampleMatchCard />
              <div className="flex flex-wrap gap-2">
                <Button size="sm">Default</Button>
                <Button size="sm" variant="outline">
                  Outline
                </Button>
                <Button size="sm" variant="secondary">
                  Secondary
                </Button>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {CLAIM_STATUSES.slice(0, 3).map((s) => (
                  <ClaimBadge key={s} status={s} />
                ))}
                <DataStatusLabel kind="cached" date={new Date("2026-11-10T02:00:00Z")} />
                <DataStatusLabel kind="hand_entered" />
              </div>
              <p className="text-sm text-muted-foreground">Muted text on the page background.</p>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: ReactNode }) {
  const id = `design-${title.toLowerCase().replace(/[^a-z]+/g, "-")}`;
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1 border-b pb-2">
        <h2 id={id} className="text-heading">
          {title}
        </h2>
        {note ? <p className="text-sm text-muted-foreground">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function TypeRow({ name, children }: { name: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-6">
      <span className="w-32 shrink-0 font-mono text-xs text-muted-foreground">{name}</span>
      {children}
    </div>
  );
}

function Code({ children }: { children: ReactNode }) {
  return (
    <code className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em] whitespace-nowrap text-foreground">{children}</code>
  );
}

/** How a match card can combine the pieces. The content is made up and says so. */
function ExampleMatchCard() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Example: Testbed for underwater sensors</CardTitle>
        <CardDescription>Testbed · RISE, Karlskrona</CardDescription>
        <CardAction>
          <Badge variant="outline">Potential match</Badge>
        </CardAction>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p>Why: your page says you build sonar for ports, and this testbed offers sea trials.</p>
        <div className="flex flex-wrap gap-1.5">
          <ClaimBadge status="stated" />
          <DataStatusLabel kind="simulated" />
        </div>
      </CardContent>
      <CardFooter className="gap-2">
        <Button size="sm">Save</Button>
        <Button size="sm" variant="ghost">
          Not relevant
        </Button>
      </CardFooter>
    </Card>
  );
}

const SWATCHES = [
  { name: "background", className: "bg-background" },
  { name: "card", className: "bg-card" },
  { name: "primary", className: "bg-primary" },
  { name: "secondary", className: "bg-secondary" },
  { name: "muted", className: "bg-muted" },
  { name: "accent", className: "bg-accent" },
  { name: "foreground", className: "bg-foreground" },
  { name: "muted-foreground", className: "bg-muted-foreground" },
  { name: "border", className: "bg-border" },
  { name: "ring", className: "bg-ring" },
  { name: "destructive", className: "bg-destructive" },
  { name: "brand", className: "bg-brand" },
  { name: "success", className: "bg-success" },
  { name: "warning", className: "bg-warning" },
  { name: "info", className: "bg-info" },
  { name: "simulated", className: "bg-simulated" },
  { name: "chart-1", className: "bg-chart-1" },
  { name: "chart-2", className: "bg-chart-2" },
  { name: "chart-3", className: "bg-chart-3" },
  { name: "chart-4", className: "bg-chart-4" },
  { name: "chart-5", className: "bg-chart-5" },
];

const SAMPLE_NOW = new Date("2026-11-14T02:10:00Z");

const SAMPLE_SOURCES: SourceHealth[] = [
  {
    source: "vinnova",
    label: "Vinnova",
    state: "live",
    lastSuccessAt: SAMPLE_NOW,
    cachedAt: null,
    itemCount: 42,
    message: null,
    verdict: "ok",
  },
  {
    source: "eu_funding",
    label: "EU Funding & Tenders",
    state: "cached",
    lastSuccessAt: new Date("2026-11-10T02:00:00Z"),
    cachedAt: new Date("2026-11-10T02:00:00Z"),
    itemCount: 129,
    message: "The search API did not answer; showing the recorded copy.",
    verdict: "cached",
  },
  {
    source: "tcl_events",
    label: "Tech Concept Lab events",
    state: "live",
    lastSuccessAt: new Date("2026-11-09T02:00:00Z"),
    cachedAt: null,
    itemCount: 6,
    message: null,
    verdict: "stale",
  },
  {
    source: "regional",
    label: "Region Blekinge, Almi",
    state: "simulated",
    lastSuccessAt: SAMPLE_NOW,
    cachedAt: null,
    itemCount: 3,
    message: null,
    verdict: "hand_entered",
  },
];
