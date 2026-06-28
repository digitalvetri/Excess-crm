// Guards voice-agent prompts against the two mistakes that have repeatedly broken live calls:
//  1. Romanized Tamil ("Vanakkam", "Naan pesuren") — the Tamil TTS mispronounces it badly.
//  2. Imperative tool-call syntax ("call updateLeadStage…") — biases the LLM to SPEAK the call.
// Used on the hand-edit save path (API rejects a failing prompt) and surfaced live in the UI.
// High-confidence rules only — meant to catch the obvious breakage, not nitpick.

export interface PromptLintIssue {
  rule: 'romanized_tamil' | 'tool_call_syntax';
  message: string;
  samples: string[];
}

export interface PromptLintResult {
  ok: boolean;
  issues: PromptLintIssue[];
}

// Common romanized-Tamil tokens. Two or more hits is a strong signal the prompt is romanized.
const ROMANIZED_TAMIL =
  /\b(vanakkam|naan|naangal|neenga|neengal|ungal?|pesuren|pesuringa|pesuranga|pesugiren|pesuvom|irukku|irundhu|illai?|sollunga|sollunga?l|panren|panrom|panni|panrennga|romba|romb|enna|seri|vendum|venum|vandhu|paaru|paathu|kekka|namma|nallaa|sari-?aa|enakku)\b/gi;

// "call <tool>" / "call <tool> with …" — naming the function imperatively. Note: a plain
// mention like "→ updateLeadStage(QUALIFIED)" (no "call") is fine and does NOT trigger this.
const TOOL_CALL_SYNTAX =
  /\bcall\s+(getLeadInfo|getFollowUpContext|updateLeadStage|updateConversionStatus|scheduleFollowUp|rescheduleFollowUp|scheduleAppointment|getProductInfo|markDoNotContact)\b/gi;

function unique(arr: string[]): string[] {
  return [...new Set(arr.map((s) => s.trim()))].filter(Boolean);
}

export function lintVoicePrompt(prompt: string): PromptLintResult {
  const issues: PromptLintIssue[] = [];

  // 3+ distinct markers = romanized prompt. (Our own prompt cites "Vanakkam"/"pesuren" once
  // each as examples of what NOT to do, so a 2-marker floor would false-positive on it.)
  const romanized = unique([...prompt.matchAll(ROMANIZED_TAMIL)].map((m) => m[0]));
  if (romanized.length >= 3) {
    issues.push({
      rule: 'romanized_tamil',
      message:
        'Looks like romanized Tamil — the Tamil voice mispronounces this. Write Tamil in Tamil SCRIPT (வணக்கம், நான் பேசுறேன்), not English letters.',
      samples: romanized.slice(0, 5),
    });
  }

  const toolCalls = unique([...prompt.matchAll(TOOL_CALL_SYNTAX)].map((m) => m[0]));
  if (toolCalls.length > 0) {
    issues.push({
      rule: 'tool_call_syntax',
      message:
        'Names a tool/function imperatively ("call …") — this makes the agent speak the function call aloud. Describe the action in plain language instead (e.g. "mark the lead qualified").',
      samples: toolCalls.slice(0, 5),
    });
  }

  return { ok: issues.length === 0, issues };
}
