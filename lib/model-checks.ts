/**
 * One working test call per model feature the app relies on (S2, S3), each
 * through modelChat(), the same path every agent uses. Shared by
 * `npm run check:models` (reads .env.local) and the staff page /staff/checks
 * (runs on the deploy, with Netlify's environment variables). Costs well
 * under one US cent: one Haiku call and three small Sonnet calls.
 */
import { z } from "zod";
import { getAnthropic, MODELS, modelChat, ModelApiError, type ChatMessage, type ChatResponse, type ToolDefinition } from "./model";

export type CheckResult = { feature: string; status: "PASS" | "FAIL" | "NOTE"; detail: string };

export const MODEL_CHECKS = {
  models: "Model IDs",
  basic: `Basic message (${MODELS.haiku})`,
  structured: `Structured output (${MODELS.sonnet})`,
  tools: `Tool calling (${MODELS.sonnet})`,
} as const;

export type ModelCheckId = keyof typeof MODEL_CHECKS;

export function isModelCheckId(value: string | null): value is ModelCheckId {
  return value !== null && Object.hasOwn(MODEL_CHECKS, value);
}

/** The reply text, or a clear error when there is none. */
function replyText(response: ChatResponse): string {
  const choice = response.choices[0];
  const content = choice?.message.content?.trim();
  if (!content) throw new Error(`Empty reply (finish_reason=${choice?.finish_reason ?? "none"})`);
  return content;
}

const runners: Record<ModelCheckId, () => Promise<string>> = {
  async models() {
    const found: string[] = [];
    for (const id of Object.values(MODELS)) {
      try {
        found.push((await getAnthropic().models.retrieve(id)).id);
      } catch (error) {
        const status = (error as { status?: number }).status;
        throw new ModelApiError(status ?? 0, `${id}: ${(error as Error).message}`);
      }
    }
    return found.join(", ");
  },

  async basic() {
    const response = await modelChat({
      model: MODELS.haiku,
      max_tokens: 64,
      effort: "low",
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    });
    return `finish_reason=${response.choices[0]?.finish_reason}, reply="${replyText(response)}"`;
  },

  async structured() {
    const Claim = z.object({ value: z.string(), quote: z.string(), confidence: z.number().min(0).max(1) });
    const schema = z.toJSONSchema(Claim) as Record<string, unknown>;
    const response = await modelChat({
      model: MODELS.sonnet,
      max_tokens: 1024,
      effort: "low",
      messages: [
        {
          role: "user",
          content:
            'Extract one claim about what the company does from this text, with a word-for-word quote and a confidence from 0 to 1: "EmbeddedArt utvecklar UV-sensorer för sjöbevakning."',
        },
      ],
      response_format: { type: "json_schema", json_schema: { name: "claim", schema, strict: true } },
    });
    const claim = Claim.parse(JSON.parse(replyText(response)));
    return `output_config.format json_schema: ${JSON.stringify(claim)}`;
  },

  async tools() {
    const tool: ToolDefinition = {
      type: "function",
      function: {
        name: "get_member_count",
        description: "Returns how many companies are members of Blue Science Park.",
        parameters: { type: "object", properties: {}, additionalProperties: false },
      },
    };
    const messages: ChatMessage[] = [{ role: "user", content: "Use the tool to find how many BSP members there are, then say the number." }];
    const first = await modelChat({ model: MODELS.sonnet, max_tokens: 1024, effort: "low", tools: [tool], tool_choice: "auto", messages });
    const reply = first.choices[0]?.message;
    const call = reply?.tool_calls?.[0];
    if (!call) throw new Error(`The tool was never called (finish_reason=${first.choices[0]?.finish_reason})`);
    if (call.function.name !== tool.function.name) throw new Error(`Called an unknown tool: ${call.function.name}`);

    // Claude's blocks go back unchanged, as in the Copilot and Scout loops.
    messages.push({ role: "assistant", content: reply.content, tool_calls: [call], ...(reply.blocks ? { blocks: reply.blocks } : {}) });
    messages.push({ role: "tool", tool_call_id: call.id, content: "55" });
    const final = await modelChat({ model: MODELS.sonnet, max_tokens: 1024, effort: "low", tools: [tool], messages });
    const text = replyText(final);
    if (!text.includes("55")) throw new Error(`The answer ignored the tool result: "${text}"`);
    return `tool called, reply="${text.replace(/\s+/g, " ").slice(0, 120)}"`;
  },
};

export async function runModelCheck(id: ModelCheckId): Promise<CheckResult> {
  const feature = MODEL_CHECKS[id];
  if (!process.env.ANTHROPIC_API_KEY) return { feature, status: "FAIL", detail: "ANTHROPIC_API_KEY is not set." };
  try {
    return { feature, status: "PASS", detail: await runners[id]() };
  } catch (error) {
    return { feature, status: "FAIL", detail: (error as Error).message };
  }
}

/** A one-line explanation for a key problem (401, 403, no credit), or null. */
export function keyHint(results: CheckResult[]): string | null {
  const failed = results.filter((r) => r.status === "FAIL").map((r) => r.detail);
  if (failed.some((d) => d.startsWith("Claude API 401"))) {
    return "401: Anthropic did not recognise ANTHROPIC_API_KEY. Copy it again from platform.claude.com (it starts with sk-ant-).";
  }
  if (failed.some((d) => d.startsWith("Claude API 403"))) {
    return "403: Anthropic refused ANTHROPIC_API_KEY. Check the key's workspace and permissions on platform.claude.com.";
  }
  if (failed.some((d) => d.startsWith("Claude API 400") && /credit balance/i.test(d))) {
    return "The account has no credit left. Add credit under Settings → Billing on platform.claude.com.";
  }
  return null;
}
