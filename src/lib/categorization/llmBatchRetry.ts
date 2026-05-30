/** Extra batch attempts after the first failure (2 => up to 3 batch tries). */
export const LLM_BATCH_RETRY_ROUNDS = 2;

/** Max one-item LLM calls after batch retries are exhausted. */
export const LLM_SINGLE_FALLBACK_CAP = 3;
