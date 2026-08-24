import { createServerFn } from "@tanstack/react-start";

export interface NarrationInput {
  /** compact grounding projection of the active report */
  context: string;
  targetKind: "workload" | "plan_step";
  targetId: string;
  /** human label used in the prompt, e.g. a comm or an action */
  targetLabel: string;
}

/**
 * Re-narrate a ledger row or predict a plan step's breakage, live.
 * Deterministic figures are never recomputed here — the model only explains.
 */
export const generateNarration = createServerFn({ method: "POST" })
  .inputValidator((input: NarrationInput) => {
    if (!input || typeof input.context !== "string" || input.context.length < 20) {
      throw new Error("A report context is required");
    }
    if (input.targetKind !== "workload" && input.targetKind !== "plan_step") {
      throw new Error("targetKind must be workload or plan_step");
    }
    return input;
  })
  .handler(async ({ data }) => {
    const { complete, DEFAULT_MODEL } = await import("@/lib/openrouter.server");

    const system = [
      "You are the narration layer of ksl (Kernel Surface Ledger), a Linux kernel attack-surface analyzer.",
      "The scoring engine is deterministic and already ran: you never invent, recompute or contradict its numbers.",
      "Explain causally and in plain language for someone who knows Linux basics but is not a kernel engineer:",
      "expand jargon on first use, and be specific about syscalls, capabilities, modules, sysctls and device nodes.",
      "Do NOT think out loud — no 'let me check', no weighing options in the open. Decide, then state it.",
      "No marketing language, no bullet padding, no emoji.",
      "Reason silently, then emit the marker and ONLY the reader-facing text after it:",
      "===ANSWER===",
      "<the explanation>",
    ].join("\n");

    const user =
      data.targetKind === "workload"
        ? `Report:\n${data.context}\n\nExplain why workload "${data.targetLabel}" (${data.targetId}) holds the kernel surface attributed to it. Name the specific elements, say which of them it alone keeps open, and what functionality would be lost if they were removed. 160 words, plain language: short sentences, each figure explained the first time it appears.`
        : `Report:\n${data.context}\n\nFor hardening step "${data.targetLabel}" (${data.targetId}): predict concretely what could break on this host given the workloads listed, and give one command an operator can run afterwards to detect that breakage. Do not restate the CVE or weight figures. 160 words, plain language: short sentences, each figure explained the first time it appears.`;

    const { text, model } = await complete([
      { role: "system", content: system },
      { role: "user", content: user },
    ]);

    return { text, model: model || DEFAULT_MODEL };
  });
