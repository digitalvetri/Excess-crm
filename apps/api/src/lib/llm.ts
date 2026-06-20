import { env } from '@excess/config';

// Shared LLM helper for all text AI features (lead summaries, broadcast copy, …).
// Uses Groq's OpenAI-compatible chat-completions API via fetch — no SDK dependency,
// matching the existing voice-agent Groq call. Designed to degrade gracefully:
// returns null when GROQ_API_KEY is unset or the request fails, so every caller
// must supply its own fallback rather than surfacing a 500.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmOptions {
  /** System prompt prepended as a system message. */
  system?: string;
  /** Max completion tokens. Default 300. */
  maxTokens?: number;
  /** Sampling temperature. Default 0.4. */
  temperature?: number;
  /** Override the model. Defaults to env.GROQ_MODEL. */
  model?: string;
  /** Abort the request after this many ms. Default 15000. */
  timeoutMs?: number;
}

/**
 * Run a single-prompt completion on Groq. Returns the assistant text, or null on
 * any failure (no key, network error, non-2xx, empty/blocked content). Callers
 * supply a fallback for the null case.
 */
export async function llmComplete(prompt: string, opts: LlmOptions = {}): Promise<string | null> {
  if (!env.GROQ_API_KEY) return null;

  const messages: LlmMessage[] = [];
  if (opts.system) messages.push({ role: 'system', content: opts.system });
  messages.push({ role: 'user', content: prompt });

  try {
    const res = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: opts.model ?? env.GROQ_MODEL,
        max_tokens: opts.maxTokens ?? 300,
        temperature: opts.temperature ?? 0.4,
        messages,
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15_000),
    });

    if (!res.ok) return null;

    const body = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
    };
    const text = body.choices?.[0]?.message?.content;
    return text && text.trim().length > 0 ? text.trim() : null;
  } catch {
    // Network error, timeout, malformed JSON — degrade to the caller's fallback.
    return null;
  }
}
