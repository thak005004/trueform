import type { FormDefinition } from "./types";
import { w2Definition } from "./w2";

/**
 * THE FORM REGISTRY.
 * ------------------
 * The single place that knows which forms exist. The classifier/router (added
 * with the second form) looks a form type up here and hands the definition to the
 * engine. Adding a form = importing its definition and adding one line here.
 *
 * The raw-shape generic is erased for storage — each definition carries its own
 * adapters, so the engine stays type-correct at the call site via the definition.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type RegisteredForm = FormDefinition<any>;

export const FORM_REGISTRY: Record<string, RegisteredForm> = {
  w2: w2Definition,
};

/** Human-facing labels for the classifier's answers and the UI. */
export const FORM_LABELS: Record<string, string> = {
  w2: "Form W-2",
};

export function getForm(id: string): RegisteredForm | null {
  return FORM_REGISTRY[id] ?? null;
}
