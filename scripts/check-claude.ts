/**
 * One working test call per Claude feature the plan relies on (S3).
 *
 *   npm run check:claude
 *
 * Needs ANTHROPIC_API_KEY. Costs a few US cents: two model lookups (free),
 * one Haiku call, three small Sonnet calls and at most one web search ($0.01).
 */
import Anthropic from "@anthropic-ai/sdk";
import { betaZodTool } from "@anthropic-ai/sdk/helpers/beta/zod";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { VERSION } from "@anthropic-ai/sdk/version";
import { z } from "zod";
import { FALLBACK_BETA, getAnthropic, MODELS, webSearchTool } from "../lib/llm";

type Result = { feature: string; ok: boolean; detail: string };

async function check(feature: string, run: () => Promise<string>): Promise<Result> {
  try {
    return { feature, ok: true, detail: await run() };
  } catch (error) {
    const detail =
      error instanceof Anthropic.APIError ? `${error.status ?? ""} ${error.message}` : (error as Error).message;
    return { feature, ok: false, detail };
  }
}

const text = (content: Anthropic.ContentBlock[]) =>
  content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set. Add it to .env.local (see .env.example) and run again.");
    process.exitCode = 1;
    return;
  }
  const client = getAnthropic();
  console.log(`@anthropic-ai/sdk ${VERSION}\n`);

  const results: Result[] = [];

  results.push(
    await check("Model IDs", async () => {
      const found = await Promise.all(Object.values(MODELS).map((id) => client.models.retrieve(id)));
      return found.map((m) => `${m.id} (${m.display_name})`).join(", ");
    }),
  );

  results.push(
    await check(`Basic message (${MODELS.fast})`, async () => {
      const response = await client.messages.create({
        model: MODELS.fast,
        max_tokens: 256,
        output_config: { effort: "low" },
        messages: [{ role: "user", content: "Reply with the single word OK." }],
      });
      return `stop_reason=${response.stop_reason}, reply="${text(response.content)}"`;
    }),
  );

  results.push(
    await check(`Structured output (${MODELS.main})`, async () => {
      const Claim = z.object({ value: z.string(), quote: z.string(), confidence: z.number() });
      const response = await client.messages.parse({
        model: MODELS.main,
        max_tokens: 2048,
        output_config: { effort: "low", format: zodOutputFormat(Claim) },
        messages: [
          {
            role: "user",
            content:
              'Extract one claim about what the company does from this text, with a word-for-word quote: "EmbeddedArt utvecklar UV-sensorer för sjöbevakning."',
          },
        ],
      });
      if (!response.parsed_output) throw new Error(`No parsed output (stop_reason=${response.stop_reason})`);
      return JSON.stringify(response.parsed_output);
    }),
  );

  results.push(
    await check(`Web search ${webSearchTool({ maxUses: 1 }).type} (${MODELS.main})`, async () => {
      const response = await client.messages.create({
        model: MODELS.main,
        max_tokens: 4096,
        output_config: { effort: "low" },
        tools: [webSearchTool({ maxUses: 1, allowedDomains: ["vinnova.se"] })],
        messages: [{ role: "user", content: "Search vinnova.se once and name one open funding call. One sentence." }],
      });
      const searches = response.usage.server_tool_use?.web_search_requests ?? 0;
      const cited = response.content.some((b) => b.type === "text" && (b.citations?.length ?? 0) > 0);
      if (searches === 0) throw new Error(`No search ran (stop_reason=${response.stop_reason})`);
      return `${searches} search, citations=${cited}, stop_reason=${response.stop_reason}`;
    }),
  );

  results.push(
    await check(`Tool Runner beta (${MODELS.main})`, async () => {
      let called = false;
      const memberCount = betaZodTool({
        name: "get_member_count",
        description: "Returns how many companies are members of Blue Science Park.",
        inputSchema: z.object({}),
        run: async () => {
          called = true;
          return "55";
        },
      });
      const final = await client.beta.messages.toolRunner({
        model: MODELS.main,
        max_tokens: 2048,
        output_config: { effort: "low" },
        tools: [memberCount],
        messages: [{ role: "user", content: "Use the tool to find how many BSP members there are, then say the number." }],
      });
      if (!called) throw new Error("The tool was never called.");
      return `tool called, reply="${text(final.content as Anthropic.ContentBlock[])}"`;
    }),
  );

  results.push(
    await check(`Refusal fallback beta (${MODELS.main})`, async () => {
      const response = await client.beta.messages.create({
        model: MODELS.main,
        max_tokens: 256,
        betas: [FALLBACK_BETA],
        fallbacks: "default",
        output_config: { effort: "low" },
        messages: [{ role: "user", content: "Reply with the single word OK." }],
      });
      return `accepted, stop_reason=${response.stop_reason}`;
    }),
  );

  for (const r of results) console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.feature}\n      ${r.detail}`);
  if (results.some((r) => !r.ok)) process.exitCode = 1;
}

main();
