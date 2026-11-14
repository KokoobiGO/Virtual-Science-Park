import Link from "next/link";
import { Button } from "@/components/ui/button";

/** /profile/<slug> for a slug that is no member company (C20). */
export default function NotFound() {
  return (
    <section className="mx-auto flex w-full max-w-5xl flex-col gap-4 px-4 py-10">
      <h1 className="text-title">No company with this address</h1>
      <p className="max-w-prose text-muted-foreground">
        No Blue Science Park member has a profile at this address. The link may be old, or the company may have left the
        member list.
      </p>
      <div>
        <Button render={<Link href="/profile" />} nativeButton={false}>
          Go to Company profile
        </Button>
      </div>
    </section>
  );
}
