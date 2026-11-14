import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { INNGEST_CHECKS } from "@/lib/inngest-checks";
import { NVIDIA_CHECKS } from "@/lib/nvidia-checks";
import { RESEND_CHECKS } from "@/lib/resend-checks";
import { VOYAGE_CHECKS } from "@/lib/voyage-checks";
import { FetchPageForm } from "./fetch-page-form";
import { ImportMembersButton } from "./import-members-button";
import { ServiceChecks } from "./service-checks";

export const metadata = { title: "Service checks" };

const list = (checks: Record<string, string>) => Object.entries(checks).map(([id, label]) => ({ id, label }));

export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-10 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Service checks</h1>
        <p className="text-muted-foreground">
          Test calls to the hosted services (backlog S2, S3). They run on the server with this deploy&apos;s
          environment variables, so no key reaches the browser.
        </p>
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">NVIDIA API</h2>
        <p className="text-sm text-muted-foreground">One call per feature the plan relies on.</p>
        <ServiceChecks endpoint="/api/checks/nvidia" button="Run NVIDIA checks" checks={list(NVIDIA_CHECKS)} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Inngest</h2>
        <p className="text-sm text-muted-foreground">
          Sends the heartbeat event and waits up to 30 seconds for Inngest to run it here.
        </p>
        <ServiceChecks endpoint="/api/checks/inngest" button="Run Inngest check" checks={list(INNGEST_CHECKS)} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Voyage AI</h2>
        <p className="text-sm text-muted-foreground">Embeds one short Swedish text and expects a 1024-dimension vector.</p>
        <ServiceChecks endpoint="/api/checks/voyage" button="Run Voyage check" checks={list(VOYAGE_CHECKS)} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Resend</h2>
        <p className="text-sm text-muted-foreground">
          Sends one email to Resend&apos;s test inbox, so nobody receives it. For the weekly digest (C18).
        </p>
        <ServiceChecks endpoint="/api/checks/resend" button="Run Resend check" checks={list(RESEND_CHECKS)} />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Page fetcher</h2>
        <p className="text-sm text-muted-foreground">
          Fetches one web page in a background job and stores its clean text as a snapshot (backlog A1).
        </p>
        <FetchPageForm />
      </div>

      <div className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Member import</h2>
        <p className="text-sm text-muted-foreground">
          Reads BSP&apos;s member list and every member page into the companies table (backlog A2). Safe to run again: it
          updates the same rows.
        </p>
        <ImportMembersButton />
      </div>

      <Suspense>
        <Gate />
      </Suspense>
    </section>
  );
}

/** The proxy already keeps other roles out; this checks again on the server. */
async function Gate() {
  await requireRole("staff");
  return null;
}
