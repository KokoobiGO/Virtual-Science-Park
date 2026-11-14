/**
 * One working test call per NVIDIA API feature the plan relies on (S2, S3).
 * Shared by `npm run check:nvidia` (reads .env.local) and the staff page
 * /staff/checks (runs on the deploy, with Netlify's environment variables).
 */
import { z } from "zod";
import {
  listNvidiaModels,
  NVIDIA_MODELS,
  nvidiaChat,
  NvidiaApiError,
  type ChatMessage,
  type ChatRequest,
  type ChatResponse,
  type ToolDefinition,
} from "./nvidia";

export type CheckResult = { feature: string; status: "PASS" | "FAIL" | "NOTE"; detail: string };

export const NVIDIA_CHECKS = {
  models: "Model IDs",
  basic: `Basic message (${NVIDIA_MODELS.fast})`,
  structured: `Structured output (${NVIDIA_MODELS.main})`,
  tools: `Tool calling (${NVIDIA_MODELS.main})`,
  "web-search": "Web search",
} as const;

export type NvidiaCheckId = keyof typeof NVIDIA_CHECKS;

export function isNvidiaCheckId(value: string | null): value is NvidiaCheckId {
  return value !== null && Object.hasOwn(NVIDIA_CHECKS, value);
}

/** The reply text, or a clear error when the model spent every token reasoning. */
function replyText(response: ChatResponse): string {
  const choice = response.choices[0];
  const content = choice?.message.content?.trim();
  if (!content) throw new Error(`Empty reply (finish_reason=${choice?.finish_reason ?? "none"})`);
  return content;
}

/** Parse JSON even if the model wrapped it in a code fence. */
function parseJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  return JSON.parse(fenced ? fenced[1] : text);
}

const runners: Record<Exclude<NvidiaCheckId, "web-search">, () => Promise<string>> = {
  async models() {
    const served = new Set(await listNvidiaModels());
    const missing = Object.values(NVIDIA_MODELS).filter((id) => !served.has(id));
    if (missing.length) throw new Error(`Not served: ${missing.join(", ")}`);
    return Object.values(NVIDIA_MODELS).join(", ");
  },

  async basic() {
    const response = await nvidiaChat({
      model: NVIDIA_MODELS.fast,
      max_tokens: 1024,
      messages: [{ role: "user", content: "Reply with the single word OK." }],
    });
    return `finish_reason=${response.choices[0]?.finish_reason}, reply="${replyText(response)}"`;
  },

  async structured() {
    const Claim = z.object({ value: z.string(), quote: z.string(), confidence: z.number().min(0).max(1) });
    const schema = z.toJSONSchema(Claim) as Record<string, unknown>;
    const base: ChatRequest = {
      model: NVIDIA_MODELS.main,
      max_tokens: 4096,
      messages: [
        {
          role: "user",
          content:
            'Extract one claim about what the company does from this text, with a word-for-word quote and a confidence from 0 to 1: "EmbeddedArt utvecklar UV-sensorer för sjöbevakning." Answer with JSON only.',
        },
      ],
    };
    // OpenAI-style first; NIM's own guided_json if the endpoint rejects it.
    let shape = "response_format json_schema";
    let response: ChatResponse;
    try {
      response = await nvidiaChat({
        ...base,
        response_format: { type: "json_schema", json_schema: { name: "claim", schema, strict: true } },
      });
    } catch (error) {
      if (!(error instanceof NvidiaApiError) || error.status >= 500 || error.status === 401 || error.status === 403) {
        throw error;
      }
      shape = "nvext.guided_json";
      response = await nvidiaChat({ ...base, nvext: { guided_json: schema } });
    }
    const claim = Claim.parse(parseJson(replyText(response)));
    return `${shape}: ${JSON.stringify(claim)}`;
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
    const messages: ChatMessage[] = [
      { role: "user", content: "Use the tool to find how many BSP members there are, then say the number." },
    ];
    const first = await nvidiaChat({ model: NVIDIA_MODELS.main, max_tokens: 4096, tools: [tool], tool_choice: "auto", messages });
    const call = first.choices[0]?.message.tool_calls?.[0];
    if (!call) throw new Error(`The tool was never called (finish_reason=${first.choices[0]?.finish_reason})`);
    if (call.function.name !== tool.function.name) throw new Error(`Called an unknown tool: ${call.function.name}`);

    messages.push({ role: "assistant", content: first.choices[0].message.content, tool_calls: [call] });
    messages.push({ role: "tool", tool_call_id: call.id, content: "55" });
    const final = await nvidiaChat({ model: NVIDIA_MODELS.main, max_tokens: 4096, tools: [tool], messages });
    const reply = replyText(final);
    if (!reply.includes("55")) throw new Error(`The answer ignored the tool result: "${reply}"`);
    return `tool called, reply="${reply.replace(/\s+/g, " ").slice(0, 120)}"`;
  },
};

export async function runNvidiaCheck(id: NvidiaCheckId): Promise<CheckResult> {
  const feature = NVIDIA_CHECKS[id];
  if (id === "web-search") {
    return {
      feature,
      status: "NOTE",
      detail:
        "No server-side web search is documented for the NVIDIA API. Scout needs its own search tool (a search API exposed through tool calling).",
    };
  }
  if (!process.env.NVIDIA_API_KEY) return { feature, status: "FAIL", detail: "NVIDIA_API_KEY is not set." };
  try {
    return { feature, status: "PASS", detail: await runners[id]() };
  } catch (error) {
    return { feature, status: "FAIL", detail: (error as Error).message };
  }
}

/** A one-line explanation for a 401 or 403 answer, or null. */
export function keyHint(results: CheckResult[]): string | null {
  const failed = results.filter((r) => r.status === "FAIL").map((r) => r.detail);
  if (failed.some((d) => d.startsWith("NVIDIA API 401"))) {
    return "401: NVIDIA did not recognise NVIDIA_API_KEY. Copy it again from build.nvidia.com (it starts with nvapi-).";
  }
  if (failed.some((d) => d.startsWith("NVIDIA API 403"))) {
    return "403: NVIDIA refused NVIDIA_API_KEY for every model tried. Replace it with a working key from build.nvidia.com.";
  }
  return null;
}
