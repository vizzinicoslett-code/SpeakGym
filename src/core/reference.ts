import { resolvePrompt } from "./promptIds";
import type { ReferenceContext, ReferenceExpression } from "./referenceTypes";

/** Only called by an explicit expansion in a completed review/history detail. */
export async function loadReference(
  context: ReferenceContext,
): Promise<ReferenceExpression | undefined> {
  if (!context.completed || context.type === "voice") return undefined;
  const prompt = resolvePrompt(context.type, context.promptId, context.prompt);
  if (!prompt) return undefined;
  if (context.type === "structured") {
    const { structuredReferences } =
      await import("../data/references/structured");
    const reference = structuredReferences[prompt.id];
    return (
      reference && {
        type: "structured",
        answer: reference.answer,
        outline: [...reference.outline],
      }
    );
  }
  if (context.type === "free") {
    const reference = await getWordReference(prompt.text);
    return (
      reference && {
        type: "free",
        answer: reference.answer,
        outline: [...reference.outline],
      }
    );
  }
  const { tripleReferences, createReferenceBridges } =
    await import("../data/references/triple");
  const reference = tripleReferences[prompt.id];
  if (!reference) return undefined;
  const actualWords = await Promise.all(
    context.interruptWords.map(async (word) => ({
      ...word,
      fact: (await getWordReference(word.word))?.bridgeFact,
    })),
  );
  return {
    type: "triple",
    mainIdea: reference.mainIdea,
    development: reference.development,
    bridges: createReferenceBridges(reference, actualWords),
    closing: reference.closing,
  };
}

export async function getWordReference(
  word: string,
): Promise<
  { answer: string; outline: string[]; bridgeFact: string } | undefined
> {
  const { words } = await import("../data/words");
  const index = words.indexOf(word);
  if (index < 0) return undefined;
  if (index < 210)
    return (await import("../data/references/freeA")).freeReferencesA[word];
  return (await import("../data/references/freeB")).freeReferencesB[word];
}
