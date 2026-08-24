/**
 * OpenRouter access. Server-only: the key never reaches the browser.
 * The deterministic ksl engine does the scoring; the model only narrates,
 * predicts breakage and drafts artifacts.
 */

import { createAnswerFilter, extractAnswer } from "@/lib/answer-filter";

export const DEFAULT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b:free";
export const FALLBACK_MODEL = "nvidia/nemotron-3-super-120b-a12b:free";

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

function endpoint() {
  return "https://openrouter.ai/api/v1/chat/completions";
}

function headers(apiKey: string) {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${apiKey}`,
    "X-Title": "Kernel Surface Ledger",
  };
}

export function requireKey(): string {
  const key = process.env["OPENROUTER_API_KEY"];
  if (!key) throw new Error("OPENROUTER_API_KEY is not configured");
  return key;
}

/** Non-streaming completion, used where only the final text matters. */
export async function complete(
  messages: ChatMessage[],
  model = DEFAULT_MODEL,
): Promise<{ text: string; model: string }> {
  const attempt = async (m: string) => {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: headers(requireKey()),
      body: JSON.stringify({
        model: m,
        messages,
        temperature: 0.2,
        max_tokens: 900,
        // Reasoning models must not leak their scratchpad into the report narration.
        reasoning: { exclude: true },
      }),
    });

    if (!res.ok) {
      const detail = await res.text();
      throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 400)}`, { cause: res.status });
    }

    const json = (await res.json()) as {
      model?: string;
      error?: { message?: string; code?: number };
      choices?: { message?: { content?: string } }[];
    };
    // OpenRouter can answer 200 with an upstream error envelope.
    if (json.error) {
      throw new Error(`OpenRouter: ${json.error.message ?? "upstream error"}`, {
        cause: json.error.code ?? 502,
      });
    }
    const raw = json.choices?.[0]?.message?.content ?? "";
    // Free reasoning pools leak their scratchpad into `content`; keep the answer only.
    const text = extractAnswer(raw) || raw.trim();
    if (!text) throw new Error("OpenRouter returned an empty completion", { cause: 502 });
    return { text, model: json.model ?? m };
  };

  try {
    return await attempt(model);
  } catch (err) {
    const status = (err as Error)?.cause;
    if (status === 400 || status === 404 || status === 429 || status === 502 || status === 503) {
      return attempt(FALLBACK_MODEL);
    }
    throw err;
  }
}

/** Streamed completion as a plain-text ReadableStream of token deltas. */
export async function streamText(
  messages: ChatMessage[],
  model = DEFAULT_MODEL,
): Promise<ReadableStream<Uint8Array>> {
  const attempt = async (m: string) => {
    const res = await fetch(endpoint(), {
      method: "POST",
      headers: headers(requireKey()),
      body: JSON.stringify({
        model: m,
        messages,
        temperature: 0.2,
        stream: true,
        max_tokens: 1200,
        reasoning: { exclude: true },
      }),
    });

    if (!res.ok || !res.body) {
      const detail = res.body ? await res.text() : "no response body";
      throw new Error(`OpenRouter ${res.status}: ${detail.slice(0, 400)}`, { cause: res.status });
    }
    return res.body;
  };

  const retryable = (status: unknown) =>
    status === 400 || status === 404 || status === 429 || status === 502 || status === 503;

  /**
   * OpenRouter can accept the request and then report an upstream failure
   * inside the SSE body (free pools go overloaded). Read frames until real
   * content arrives, so we can still switch models before anything is emitted.
   */
  const openWithContent = async (m: string) => {
    const body = await attempt(m);
    const reader = body.getReader();
    const decoder = new TextDecoder();
    const encoder = new TextEncoder();
    let buffer = "";
    const pending: string[] = [];
    const answer = createAnswerFilter();
    let rawDeltas = 0;

    const drain = (text: string) => {
      buffer += text;
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed.startsWith("data:")) continue;
        const payload = trimmed.slice(5).trim();
        if (payload === "[DONE]") continue;
        let parsed: {
          error?: { code?: number; message?: string };
          choices?: { delta?: { content?: string } }[];
        };
        try {
          parsed = JSON.parse(payload);
        } catch {
          continue; // keep-alives and partial frames
        }
        if (parsed.error) {
          throw new Error(`OpenRouter: ${parsed.error.message ?? "upstream error"}`, {
            cause: parsed.error.code ?? 502,
          });
        }
        const delta = parsed.choices?.[0]?.delta?.content;
        if (delta) {
          rawDeltas += 1;
          const visible = answer.push(delta);
          if (visible) pending.push(visible);
        }
      }
    };

    // Probe until the model actually starts producing tokens.
    let done = false;
    let sawToken = false;
    while (!sawToken && !done) {
      const chunk = await reader.read();
      if (chunk.done) {
        done = true;
        break;
      }
      drain(decoder.decode(chunk.value, { stream: true }));
      sawToken = rawDeltas > 0;
    }

    // The pool accepted the request and then produced no tokens at all — that
    // is an upstream failure, not an answer. Let the caller retry elsewhere.
    if (!sawToken) {
      throw new Error("OpenRouter produced no tokens", { cause: 503 });
    }

    return new ReadableStream<Uint8Array>({
      async pull(controller) {
        const finish = () => {
          const tail = answer.flush();
          if (tail) controller.enqueue(encoder.encode(tail));
          controller.close();
        };

        while (pending.length) controller.enqueue(encoder.encode(pending.shift()!));
        if (done) {
          finish();
          return;
        }
        const chunk = await reader.read();
        if (chunk.done) {
          finish();
          return;
        }
        try {
          drain(decoder.decode(chunk.value, { stream: true }));
        } catch {
          finish();
          return;
        }
        while (pending.length) controller.enqueue(encoder.encode(pending.shift()!));
      },
      cancel() {
        void reader.cancel();
      },
    });
  };

  try {
    return await openWithContent(model);
  } catch (err) {
    if (retryable((err as Error)?.cause)) {
      return openWithContent(FALLBACK_MODEL);
    }
    throw err;
  }
}
