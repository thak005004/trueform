import type { W2 } from "./w2-schema.js";
import { runValidation } from "@/forms/engine";
import { w2Definition } from "@/forms/w2";
import type { ValidationResult } from "@/forms/types";

/**
 * W-2 VALIDATION — now a thin wrapper over the form-agnostic engine.
 * -----------------------------------------------------------------
 * Before this refactor, all the W-2 tax math lived here. It now lives in the W-2
 * DEFINITION (@/forms/w2) as declarative rules + a customValidate escape hatch,
 * and this function just runs the generic engine (@/forms/engine) over it. The
 * app still imports `validateW2` and the result types from here unchanged, and
 * behavior is identical — see validation.test.ts (asserts the same issue codes
 * and severities). W-2 is now "just the first definition"; adding another form
 * touches a new definition file, never this engine.
 *
 * Trust thesis intact: every flag still comes from arithmetic, format, or
 * cross-field reconciliation the form must satisfy — never model self-confidence.
 */

export type { Severity, Issue, FieldStatus, ValidationResult } from "@/forms/types";

export function validateW2(w2: W2): ValidationResult {
  return runValidation(w2, w2Definition);
}
