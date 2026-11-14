/**
 * The matcher's judge (A16): one model call reads the company profile and up
 * to five ranked opportunities and answers keep or reject, why, a next step
 * and the uncertainties for each. verify.ts checks the reply in code.
 *
 * The backlog names Sonnet; while we test with NVIDIA's free key it is
 * NVIDIA_MODELS.main, with thinking off (on, one call takes longer than a job
 * step may). The prompt and schema do not depend on the provider.
 *
 * API errors (a 429, a timeout) are thrown for the caller to handle; an answer
 * that fails a check comes back in `failed`, with the reasons.
 */
import { NVIDIA_MODELS, nvidiaChat } from "../nvidia";
import { judgeJsonSchema } from "./output";
import { buildJudgeUserMessage, JUDGE_SYSTEM_PROMPT, type JudgeOpportunity } from "./prompt";
import { checkJudgeReply, type CheckedEntry, type FailedEntry } from "./verify";

export { JUDGE_BATCH } from "./prompt";
export type { JudgeOpportunity } from "./prompt";
export type { Judgement } from "./verify";

/** Netlify cuts a job step off after 30 s; one call stops before that. */
export const JUDGE_TIMEOUT_MS = 26_000;

export type JudgeUsage = { calls: number; inputTokens: number; outputTokens: number };

export const emptyJudgeUsage = (): JudgeUsage => ({ calls: 0, inputTokens: 0, outputTokens: 0 });

export type JudgeBatchRun = {
  accepted: CheckedEntry[];
  failed: FailedEntry[];
  model: string;
  seconds: number;
  finishReason: string | null;
  usage: JudgeUsage;
};

export type JudgeBatchOptions = {
  model?: string;
  timeoutMs?: number;
  /** A retry: what was wrong with the first answer. */
  feedback?: string;
  today?: Date;
};

/** One model call for up to five opportunities, keyed by their prompt ids (M1, M2, ...). */
export async function judgeBatch(
  company: { name: string; profileText: string },
  opportunities: JudgeOpportunity[],
  options: JudgeBatchOptions = {},
): Promise<JudgeBatchRun> {
  if (!opportunities.length) throw new Error("judgeBatch: no opportunities to judge.");
  const ids = opportunities.map((o) => o.id);
  if (new Set(ids).size !== ids.length) throw new Error("judgeBatch: every opportunity needs its own id.");
  const model = options.model ?? NVIDIA_MODELS.main;
  const started = Date.now();

  const response = await nvidiaChat(
    {
      model,
      max_tokens: 2000,
      // A retry at 0 tends to repeat the same words; a little variation gets it out.
      temperature: options.feedback ? 0.3 : 0,
      messages: [
        { role: "system", content: JUDGE_SYSTEM_PROMPT },
        { role: "user", content: buildJudgeUserMessage(company, opportunities, { today: options.today, feedback: options.feedback }) },
      ],
      response_format: { type: "json_schema", json_schema: { name: "match_judgements", schema: judgeJsonSchema(ids), strict: true } },
      chat_template_kwargs: { enable_thinking: false },
    },
    { timeoutMs: options.timeoutMs ?? JUDGE_TIMEOUT_MS },
  );

  const choice = response.choices[0];
  const checked = checkJudgeReply(choice?.message.content?.trim() ?? "", ids, {
    sharedAreas: Object.fromEntries(opportunities.map((o) => [o.id, o.sharedAreas])),
    retry: options.feedback !== undefined,
  });
  return {
    ...checked,
    model: response.model ?? model,
    seconds: Math.round((Date.now() - started) / 100) / 10,
    finishReason: choice?.finish_reason ?? null,
    usage: { calls: 1, inputTokens: response.usage?.prompt_tokens ?? 0, outputTokens: response.usage?.completion_tokens ?? 0 },
  };
}
