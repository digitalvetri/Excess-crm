import { describe, it, expect } from 'vitest';
import { lintVoicePrompt } from './voice-prompt-lint.js';

describe('lintVoicePrompt', () => {
  it('passes a clean Tamil-script prompt', () => {
    const good = `வணக்கம்! நான் ரெஷ்மா, எக்செஸ் ரென்யூ சோலார்-ல இருந்து பேசுறேன்.
மாசம் கரண்ட் பில் எவ்வளவு வரும் சார்? Write everything in Tamil script.
Interested + qualified → updateLeadStage("QUALIFIED")`;
    const r = lintVoicePrompt(good);
    expect(r.ok).toBe(true);
    expect(r.issues).toHaveLength(0);
  });

  it('catches the romanized hand-edited prompt that broke live calls', () => {
    const romanized = `Tamil: "Vanakkam! [name] sir pesugireergala? Naan Excess Renew Solar-ilirundhu Reshma pesugiren."
Interested and qualified → call updateLeadStage with stage "QUALIFIED"`;
    const r = lintVoicePrompt(romanized);
    expect(r.ok).toBe(false);
    const rules = r.issues.map((i) => i.rule);
    expect(rules).toContain('romanized_tamil'); // Vanakkam, Naan, pesugiren…
    expect(rules).toContain('tool_call_syntax'); // "call updateLeadStage"
  });

  it('flags romanized Tamil (2+ markers)', () => {
    const r = lintVoicePrompt('Naan ungalukku solar pathi sollalam, romba nallaa irukku.');
    expect(r.ok).toBe(false);
    expect(r.issues.some((i) => i.rule === 'romanized_tamil')).toBe(true);
  });

  it('does NOT flag a plain tool reference without "call" (our code style)', () => {
    const r = lintVoicePrompt('Decision: interested → updateLeadStage("QUALIFIED"); callback → scheduleFollowUp.');
    expect(r.issues.some((i) => i.rule === 'tool_call_syntax')).toBe(false);
  });

  it('does not false-positive on English instruction text', () => {
    const r = lintVoicePrompt('You are a solar sales agent. Always be warm and concise. Use the customer name.');
    expect(r.ok).toBe(true);
  });
});
