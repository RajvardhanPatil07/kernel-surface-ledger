/**
 * Reasoning models on the free pools frequently think out loud in the visible
 * `content` channel ("Let's craft...", "We must keep under 220 words"), and
 * sometimes echo the prompt's output contract back at the reader. That is
 * deliberation, not an answer. Every prompt in this app asks for the
 * user-facing text after a hard marker; this filter keeps only that text and
 * removes any scratchpad or echoed instructions that leaked around it.
 */

export const ANSWER_MARKER = "===ANSWER===";

const SCRATCHPAD_BLOCK = /<(think|thinking|reasoning|scratchpad)>[\s\S]*?<\/\1>/gi;
const OPEN_SCRATCHPAD = /<(think|thinking|reasoning|scratchpad)>[\s\S]*$/i;

/** The first labelled section of the answer contract, at the start of a line. */
const ANSWER_HEADING = /(^|\n)\s*(?:\*\*)?ANSWER\s*(?:\*\*)?\s*:/i;

/** Lines that are the model talking to itself or restating the instructions. */
const DELIBERATION_LINE =
  /^\s*(?:(?:so |ok(?:ay)?,? |now |but |and )?(?:let'?s|let me|i (?:should|need|will|must|can)|we (?:should|need|must|can|will|have to)|maybe|perhaps|first,? i|i'?ll)\b|(?:then )?(?:answer|why|what it could break|check it)\s*(?:heading|section)?\s*(?:should|must|:?\s*one sentence|:?\s*2-4)|provide (?:a )?concise|keep (?:it )?under \d+ words|we must keep|output should be|so we (?:can|need to) cite|but we need to|now (?:why|the) lines?\b|here'?s the (?:answer|output)|final answer\s*:?\s*$)/i;

function stripDeliberation(text: string): string {
  const kept = text
    .split("\n")
    .filter((line) => !DELIBERATION_LINE.test(line))
    .join("\n");
  return kept.replace(/\n{3,}/g, "\n\n").trim();
}

/**
 * Keep the answer only: drop scratchpad tags, anything before the final-answer
 * marker, anything before the last real `ANSWER:` heading, and leftover
 * self-talk lines.
 */
export function extractAnswer(raw: string): string {
  let text = raw.replace(SCRATCHPAD_BLOCK, "").replace(OPEN_SCRATCHPAD, "");
  const marker = text.lastIndexOf(ANSWER_MARKER);
  if (marker !== -1) text = text.slice(marker + ANSWER_MARKER.length);

  // Structured answers begin at an `ANSWER:` heading; anything before the last
  // one is preamble the model was told not to emit.
  const matches = [...text.matchAll(new RegExp(ANSWER_HEADING.source, "gi"))];
  const last = matches.at(-1);
  if (last && typeof last.index === "number") {
    text = text.slice(last.index + (last[1] ? last[1].length : 0));
  }

  const cleaned = stripDeliberation(text.replace(/^[\s:>*-]+/, ""));
  // Never swallow an answer: if the deliberation filter ate everything, fall
  // back to the scratchpad-stripped text.
  if (cleaned) return cleaned;
  return text.replace(/^[\s:>*-]+/, "").trim() || raw.trim();
}

/** Beyond this many buffered characters we stop waiting for a marker. */
const PREAMBLE_LIMIT = 600;

/**
 * Streaming counterpart. Buffers until the answer actually starts (the marker,
 * or an `ANSWER:` heading), then passes tokens straight through. When the model
 * never emits either, the buffer is released once it grows past
 * `PREAMBLE_LIMIT` (or at `flush()`), so an answer is never swallowed.
 */
export function createAnswerFilter() {
  let buffer = "";
  let open = false;

  const startIndex = (text: string): { at: number; skip: number } | null => {
    const marker = text.lastIndexOf(ANSWER_MARKER);
    if (marker !== -1) return { at: marker, skip: ANSWER_MARKER.length };
    const matches = [...text.matchAll(new RegExp(ANSWER_HEADING.source, "gi"))];
    const last = matches.at(-1);
    if (last && typeof last.index === "number") {
      return { at: last.index + (last[1] ? last[1].length : 0), skip: 0 };
    }
    return null;
  };

  return {
    push(chunk: string): string {
      if (open) return chunk;
      buffer += chunk;
      const start = startIndex(buffer);
      if (!start) {
        // The model ignored the contract; release what it wrote rather than
        // showing the reader an empty answer.
        if (buffer.length > PREAMBLE_LIMIT) {
          open = true;
          const text = extractAnswer(buffer);
          buffer = "";
          return text;
        }
        return "";
      }
      open = true;
      const tail = buffer.slice(start.at + start.skip).replace(/^[\s:>*-]+/, "");
      buffer = "";
      return tail;
    },
    flush(): string {
      if (open) return "";
      const text = extractAnswer(buffer);
      buffer = "";
      open = true;
      return text;
    },
  };
}
