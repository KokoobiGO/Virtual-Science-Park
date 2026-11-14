# Which free NVIDIA model the app uses

Measured on 2026-11-14 with our free developer key, by a benchmark script that made real calls: a ping, a 3,000-token prompt with 600 output tokens, strict structured output, tool calling, then the real judge prompt (3 batches of 5 opportunities with known keep/reject answers) and the real tagger prompt (10 texts with known tags). The samples are small: read the scores as a strong hint, not a proof.

The benchmark script itself was lost when its run was cut off; this table is its saved output.

| Model | Answers | Thinking (setting used) | Reasoning in answer | Structured output | Tools | 3k in / 600 out | Judge: pass checks, 1st answer | Judge: keep/reject right | Tagger: texts right (missed / extra tags) | Quality calls: s mean / max | Quality test |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `nvidia/nemotron-3.5-lightning-30b-a3b` (baseline) | yes | on by default (139 tokens for "OK"); off with enable_thinking:false (enable_thinking:false) | 0 of 10 (separate field in 1) | response_format: yes; guided_json: refused | yes | 6 s | 11/15 (73 %) | 14/15 (93 %) | 7/10 (3 / 0) | 6.4 / 8.2 | done |
| `moonshotai/kimi-k2.6` | no: HTTP 404: NVIDIA API 404: {"status":404,"title":"Not Found","detail":"Function '<id>': Not found for account '<hidden>'"} | - | - | - | - | - | - | - | - | - | dropped: does not answer: HTTP 404: NVIDIA API 404: {"status":404,"title":"Not Found","detail":"Function '<id>': Not found for account '<hidden>'"} |
| `deepseek-ai/deepseek-v4.1-flash` | no: no answer within 60 s | - | - | - | - | - | - | - | - | - | dropped: does not answer: no answer within 60 s |
| `z-ai/glm-5.3-flash` | no: no answer within 60 s | - | - | - | - | - | - | - | - | - | dropped: does not answer: no answer within 60 s |
| `minimaxai/minimax-m3.1-flash` | yes | on by default (19 tokens for "OK"); off with enable_thinking:false (enable_thinking:false) | 0 of 10 (separate field in 1) | response_format: yes; guided_json: refused | yes | 23.8 s, 19.3 s | 10/15 (67 %) | 10/15 (67 %) | 10/10 (0 / 0) | 33.2 / 54.5 | done |
| `mistralai/mistral-large-4-1t-a52b` | yes | on by default; could not turn it off (fewest: 24 tokens for "OK" with thinking:false) (thinking:false) | 0 of 4 (separate field in 4) | - | - | > 60 s | - | - | - | - | dropped: too slow: no answer within 60 s for 3k in / 600 out |
| `google/gemma-4-31b-it` | yes | off by default; enable_thinking:false accepted (enable_thinking:false) | 0 of 10 | response_format: yes; guided_json: refused | yes | 19.8 s | 13/15 (87 %) | 15/15 (100 %) | 10/10 (0 / 0) | 15.1 / 17.1 | done |
| `nvidia/nemotron-3-ultra-550b-a55b` | no: HTTP 503: NVIDIA API 503: {"message":"Service temporarily overloaded","type":"Overloaded","code":503} | - | - | - | - | - | - | - | - | - | dropped: does not answer: HTTP 503: NVIDIA API 503: {"message":"Service temporarily overloaded","type":"Overloaded","code":503} |
| `nvidia/nemotron-3-super-120b-a12b` | no: HTTP 404: NVIDIA API 404: {"status":404,"title":"Not Found","detail":"Function '<id>': Not found for account '<hidden>'"} | - | - | - | - | - | - | - | - | - | dropped: does not answer: HTTP 404: NVIDIA API 404: {"status":404,"title":"Not Found","detail":"Function '<id>': Not found for account '<hidden>'"} |
| `nvidia/nemotron-3.5-super-vl-120b-a12b` | yes | on by default (28 tokens for "OK"); off with enable_thinking:false (enable_thinking:false) | 0 of 10 (separate field in 1) | response_format: yes; guided_json: refused | yes | 5.2 s | 14/15 (93 %) | 15/15 (100 %) | 10/10 (0 / 0) | 6.3 / 8.1 | done |
| `stepfun-ai/step-5-preview` | yes | on by default; could not turn it off (fewest: 36 tokens for "OK" with thinking:false) (thinking:false) | 0 of 3 (separate field in 3) | - | - | > 60 s | - | - | - | - | dropped: too slow: no answer within 60 s for 3k in / 600 out |
| `nvidia/llama-3.1-nemotron-ultra-253b-v1` | no: HTTP 404: NVIDIA API 404: {"status":404,"title":"Not Found","detail":"Function '<id>': Not found for account '<hidden>'"} | - | - | - | - | - | - | - | - | - | dropped: does not answer: HTTP 404: NVIDIA API 404: {"status":404,"title":"Not Found","detail":"Function '<id>': Not found for account '<hidden>'"} |
| `openai/gpt-oss-20b` | no: no answer within 60 s | - | - | - | - | - | - | - | - | - | dropped: does not answer: no answer within 60 s |

## Recommendation

- main: nvidia/nemotron-3.5-super-vl-120b-a12b (best combined score (half judge verdicts, 30 % judge checks, 20 % tags): 15/15 verdicts right, 14/15 entries pass the checks on the first answer, 10/10 texts tagged right, 6.3 s per call (max 8.1 s))
- fast: nvidia/nemotron-3.5-super-vl-120b-a12b (quickest of the models within one text of the best tagger score: 10/10 texts tagged right, 6.3 s per call (max 8.1 s))

Decision (project owner, 2026-11-14): both slots use `nvidia/nemotron-3.5-super-vl-120b-a12b`. It is set in `lib/nvidia.ts`; `NVIDIA_MODEL_MAIN` and `NVIDIA_MODEL_FAST` override it.
