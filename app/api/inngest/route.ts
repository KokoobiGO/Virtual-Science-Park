import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { functions } from "@/lib/inngest/functions";

// Inngest calls back here to run each step. Long work is split into steps,
// so no single request comes near Netlify's 60 s function limit. After a
// deploy that adds or changes a function, sync again: PUT /api/inngest.
export const { GET, POST, PUT } = serve({ client: inngest, functions });
