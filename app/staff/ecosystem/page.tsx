import { Suspense } from "react";
import { LoadingState, Skeleton } from "@/components/loading-skeleton";
import { requireRole } from "@/lib/auth";
import { CONNECTION_DISCLAIMER } from "@/lib/connections";
import { unconnected } from "@/lib/staff-views/ecosystem";
import { loadEcosystem } from "@/lib/staff-views/query";
import { EcosystemView } from "./ecosystem-view";

export const metadata = { title: "Ecosystem map" };

export default function Page({ searchParams }: PageProps<"/staff/ecosystem">) {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-10">
      <div className="flex flex-col gap-1">
        <h1 className="text-title">Ecosystem map</h1>
        <p className="text-muted-foreground">
          Members that may have a reason to talk, found from their public profiles: each line is one possible
          collaboration with a stated basis. {CONNECTION_DISCLAIMER}
        </p>
      </div>
      <Suspense
        fallback={
          <LoadingState label="Loading the map…">
            <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_18rem]">
              <Skeleton className="aspect-[760/440] w-full rounded-xl" />
              <div className="flex flex-col gap-1.5">
                {[0, 1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-14 rounded-lg" />
                ))}
              </div>
            </div>
          </LoadingState>
        }
      >
        <Ecosystem searchParams={searchParams} />
      </Suspense>
    </section>
  );
}

/** Reads the session and the stored connections, so it streams in behind the Suspense boundary above. */
async function Ecosystem({ searchParams }: Pick<PageProps<"/staff/ecosystem">, "searchParams">) {
  // The proxy already sends members away; this refuses them on the server too.
  const viewer = await requireRole("staff");
  const { members, connections } = await loadEcosystem(viewer.claims);
  const alone = unconnected(members, connections);
  // `?pair=<id>` opens one pair straight away, so a link can point at it.
  const pair = (await searchParams).pair;
  const openId = connections.find((c) => c.id === pair)?.id ?? null;

  return (
    <div className="flex flex-col gap-8">
      {connections.length ? (
        <EcosystemView connections={connections} openId={openId} />
      ) : (
        <p className="rounded-xl border p-6 text-sm text-muted-foreground">
          No possible collaborations are stored yet. They appear after the connection finder has run; the team starts it
          with <code className="font-mono">npm run connections</code>.
        </p>
      )}
      <div className="flex flex-col gap-2">
        <h2 className="text-heading">Members without a stored connection ({alone.length})</h2>
        {alone.length ? (
          <>
            <p className="text-sm text-muted-foreground">
              The finder found no pair with a concrete reason for these members in its latest run.
            </p>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
              {alone.map((m) => (
                <li key={m.id} className="break-words">
                  {m.name}
                </li>
              ))}
            </ul>
          </>
        ) : (
          <p className="text-sm text-muted-foreground">Every member has at least one stored connection.</p>
        )}
      </div>
    </div>
  );
}
