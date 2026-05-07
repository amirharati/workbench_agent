import { runOpenRouterCompletion } from './providers/openrouter';
import { AICompletionRequest, AICompletionResponse, AISettings } from './types';

const validateConfig = (settings: AISettings): void => {
  if (!settings.baseUrl.trim()) {
    throw new Error('AI base URL is required.');
  }
  if (!settings.model.trim()) {
    throw new Error('AI model is required.');
  }
};

export const runAICompletion = async (
  settings: AISettings,
  request: AICompletionRequest
): Promise<AICompletionResponse> => {
  validateConfig(settings);

  switch (settings.provider) {
    case 'openrouter':
      return runOpenRouterCompletion(settings, request);
    default:
      return runOpenRouterCompletion(settings, request);
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
