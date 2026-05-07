import { runOpenRouterCompletion } from './providers/openrouter';
import { runChromeNativeCompletion } from './providers/chromeNative';
import { AICompletionRequest, AICompletionResponse, AISettings } from './types';

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
  return (routed && routed.trim()) || settings.model;
};

export const runAICompletion = async (
  settings: AISettings,
  request: AICompletionRequest
): Promise<AICompletionResponse> => {
  validateConfig(settings);
  const effectiveModel = getEffectiveModelForTask(settings, request);

  switch (settings.provider) {
    case 'openrouter':
      return runOpenRouterCompletion(settings, request, effectiveModel);
    case 'chrome-native':
      return runChromeNativeCompletion(settings, request);
    default:
      return runOpenRouterCompletion(settings, request, effectiveModel);
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
