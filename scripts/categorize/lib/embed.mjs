export async function embedTexts(settings, inputs, batchSize = 48) {
  if (!settings.apiKey?.trim()) {
    throw new Error('Missing OPENROUTER_API_KEY for embeddings.');
  }
  if (!inputs.length) return [];

  const base = settings.baseUrl.replace(/\/+$/, '');
  const endpoint = `${base}/embeddings`;
  const all = new Array(inputs.length);

  for (let offset = 0; offset < inputs.length; offset += batchSize) {
    const chunk = inputs.slice(offset, offset + batchSize);
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), settings.timeoutMs ?? 60_000);
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${settings.apiKey.trim()}`,
          'HTTP-Referer': 'https://workbench-agent.local',
          'X-Title': 'Workbench Agent Categorize CLI',
        },
        signal: controller.signal,
        body: JSON.stringify({
          model: settings.model,
          input: chunk,
          encoding_format: 'float',
        }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let message = errText || `Embeddings HTTP ${res.status}`;
        try {
          const parsed = JSON.parse(errText);
          if (parsed?.error?.message) {
            message =
              res.status === 401
                ? `OpenRouter embeddings auth failed (${parsed.error.message}). Chat may still work — confirm OPENROUTER_API_KEY in .env matches fetch-ai-eval, and that your account can use /embeddings at openrouter.ai/models?output_modalities=embeddings`
                : parsed.error.message;
          }
        } catch {
          /* use raw */
        }
        throw new Error(message);
      }
      const json = await res.json();
      if (json.error?.message) throw new Error(json.error.message);
      for (const row of json.data ?? []) {
        const idx = row.index ?? 0;
        if (row.embedding) all[offset + idx] = row.embedding;
      }
    } finally {
      clearTimeout(t);
    }
  }

  if (all.some((v) => !v)) throw new Error('Embeddings response missing vectors.');
  return all;
}
