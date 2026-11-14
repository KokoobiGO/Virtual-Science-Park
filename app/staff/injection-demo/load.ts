import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseDemoResult, type LoadedDemoResult } from "@/lib/injection/demo-result";

/** The last result scripts/injection-demo.ts wrote. Read from disk; no model call, no database. */
export async function loadDemoResult(): Promise<LoadedDemoResult> {
  // Literal path parts, so the build's file tracing can see which file the page reads.
  const file = path.join(process.cwd(), "data", "injection-demo", "result.json");
  let text: string | null = null;
  try {
    text = await readFile(file, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
  return parseDemoResult(text);
}
