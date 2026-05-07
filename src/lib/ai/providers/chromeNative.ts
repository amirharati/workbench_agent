import { AIClientError, AICompletionRequest, AICompletionResponse, AISettings } from '../types';

interface PromptSession {
  prompt: (input: string) => Promise<string>;
  destroy?: () => void;
}

type PromptLanguageCode = 'en' | 'es' | 'ja';

interface LanguageExpectation {
  type: 'text';
  languages: PromptLanguageCode[];
}

interface CreateOptions {
  systemPrompt?: string;
  temperature?: number;
  topK?: number;
  /**
   * Older/experimental shape observed in some Chrome versions.
   */
  outputLanguage?: PromptLanguageCode;
  /**
   * Current docs shape for language safety attestation.
   */
  expectedInputs?: LanguageExpectation[];
  expectedOutputs?: LanguageExpectation[];
}

interface LanguageModelApi {
  create: (options?: CreateOptions) => Promise<PromptSession>;
  availability?: (options?: CreateOptions) => Promise<
    'unavailable' | 'downloadable' | 'downloading' | 'available' | string
  >;
}

const withTimeout = async <T>(
  promise: Promise<T>,
  timeoutMs: number,
  timeoutMessage: string
): Promise<T> => {
  let timerId: number | null = null;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timerId = window.setTimeout(() => {
      reject(new AIClientError('timeout', timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timerId !== null) window.clearTimeout(timerId);
  }
};

const getLanguageModelApi = (): LanguageModelApi | null => {
  const root = globalThis as unknown as { LanguageModel?: LanguageModelApi };
  return root.LanguageModel ?? null;
};

const detectOutputLanguage = (): PromptLanguageCode => {
  const lang = (navigator.language || 'en').toLowerCase();
  if (lang.startsWith('es')) return 'es';
  if (lang.startsWith('ja')) return 'ja';
  return 'en';
};

const messagesToPrompt = (request: AICompletionRequest): { systemPrompt?: string; prompt: string } => {
  const systemParts: string[] = [];
  const conversationParts: string[] = [];

  for (const message of request.messages) {
    if (message.role === 'system') {
      systemParts.push(message.content.trim());
      continue;
    }
    const roleLabel = message.role === 'assistant' ? 'Assistant' : 'User';
    conversationParts.push(`${roleLabel}: ${message.content.trim()}`);
  }

  const prompt = conversationParts.join('\n\n').trim();
  if (!prompt) {
    throw new AIClientError(
      'invalid-config',
      'Chrome native provider needs at least one user/assistant message.'
    );
  }

  return {
    systemPrompt: systemParts.join('\n\n').trim() || undefined,
    prompt,
  };
};

export const runChromeNativeCompletion = async (
  settings: AISettings,
  request: AICompletionRequest
): Promise<AICompletionResponse> => {
  const languageModel = getLanguageModelApi();
  if (!languageModel?.create) {
    throw new AIClientError(
      'provider',
      'Chrome native AI is unavailable. Use Chrome with built-in AI support or switch provider.'
    );
  }

  const { systemPrompt, prompt } = messagesToPrompt(request);
  const timeoutMs = settings.timeoutMs;
  const language = detectOutputLanguage();
  const createOptions: CreateOptions = {
    ...(systemPrompt ? { systemPrompt } : {}),
    outputLanguage: language,
    expectedInputs: [{ type: 'text', languages: [language] }],
    expectedOutputs: [{ type: 'text', languages: [language] }],
  };

  // Chrome docs recommend using the same options in availability/create.
  if (typeof languageModel.availability === 'function') {
    await withTimeout(
      languageModel.availability(createOptions),
      timeoutMs,
      `Chrome native AI availability check timed out after ${timeoutMs}ms.`
    );
  }

  // Prompt API currently requires topK+temperature to be provided together,
  // or neither. We keep v1 simple and rely on provider defaults here.
  const session = await withTimeout(
    languageModel.create(createOptions),
    timeoutMs,
    `Chrome native AI session initialization timed out after ${timeoutMs}ms.`
  );

  try {
    const text = await withTimeout(
      session.prompt(prompt),
      timeoutMs,
      `Chrome native AI response timed out after ${timeoutMs}ms.`
    );
    const output = String(text || '').trim();
    if (!output) {
      throw new AIClientError('provider', 'Chrome native provider returned an empty response.');
    }

    return {
      text: output,
      model: 'chrome-native',
      requestedModel: settings.model,
      modelMismatch: false,
    };
  } catch (error) {
    if (error instanceof AIClientError) throw error;
    throw new AIClientError('provider', 'Chrome native provider failed to generate a response.');
  } finally {
    if (typeof session.destroy === 'function') session.destroy();
  }
};
