import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

// Inngest calls back here to run each step. Long work is split into steps,
// so no single request comes near Vercel's 300 s limit.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
