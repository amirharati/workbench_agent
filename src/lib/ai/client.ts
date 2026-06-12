import { runOpenRouterCompletion } from './providers/openrouter';
import { runChromeNativeCompletion } from './providers/chromeNative';
import { AICompletionRequest, AICompletionResponse, AISettings } from './types';
import { recordAICallAudit } from './callAudit';

const validateConfig = (settings: AISettings): void => {
  if (settings.provider === 'openrouter') {
    if (!settings.baseUrl.trim()) {
      throw new Error('AI base URL is required.');
    }
    if (!settings.model.trim()) {
      throw new Error('AI model is required.');
    }
  }
};

const getEffectiveModelForTask = (settings: AISettings, request: AICompletionRequest): string => {
  if (settings.routingMode !== 'by-task') return settings.model;
  const taskType = request.taskType ?? 'general';
  const routed = settings.taskModels?.[taskType];
  if (routed?.trim()) return routed.trim();
  if (taskType === 'redirect_verdict' && settings.taskModels?.summarize?.trim()) {
    return settings.taskModels.summarize.trim();
  }
  return settings.model;
};

export const runAICompletion = async (
  settings: AISettings,
  request: AICompletionRequest
): Promise<AICompletionResponse> => {
  validateConfig(settings);
  const effectiveModel = getEffectiveModelForTask(settings, request);
  const taskType = request.taskType ?? 'general';
  const startedAt = Date.now();
  const audit = request.audit;

  try {
    let response: AICompletionResponse;
    switch (settings.provider) {
      case 'openrouter':
        response = await runOpenRouterCompletion(settings, request, effectiveModel);
        break;
      case 'chrome-native':
        response = await runChromeNativeCompletion(settings, request);
        break;
      default:
        response = await runOpenRouterCompletion(settings, request, effectiveModel);
    }
    if (audit) {
      recordAICallAudit({
        audit,
        taskType,
        startedAt,
        messages: request.messages,
        response,
      });
    }
    return response;
  } catch (error) {
    if (audit) {
      const message =
        error instanceof Error ? error.message : typeof error === 'string' ? error : 'AI request failed';
      recordAICallAudit({
        audit,
        taskType,
        startedAt,
        messages: request.messages,
        error: message,
      });
    }
    throw error;
  }
};

export const runAITestPrompt = async (
  settings: AISettings,
  prompt: string
): Promise<AICompletionResponse> => {
  const userPrompt = prompt.trim();
  if (!userPrompt) {
    throw new Error('Test prompt is required.');
  }

  return runAICompletion(settings, {
    taskType: 'general',
    messages: [{ role: 'user', content: userPrompt }],
  });
};
