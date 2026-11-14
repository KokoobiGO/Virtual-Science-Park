import { Suspense } from "react";
import { requireRole } from "@/lib/auth";
import { NVIDIA_CHECKS, type NvidiaCheckId } from "@/lib/nvidia-checks";
import { NvidiaChecks } from "./nvidia-checks";

export const metadata = { title: "Service checks" };

const checks = (Object.entries(NVIDIA_CHECKS) as [NvidiaCheckId, string][]).map(([id, label]) => ({ id, label }));

export default function Page() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold">Service checks</h1>
        <p className="text-muted-foreground">
          One test call per NVIDIA API feature (backlog S3). They run on the server with this deploy&apos;s
          environment variables, so the key never reaches the browser.
        </p>
      </div>
      <NvidiaChecks checks={checks} />
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
