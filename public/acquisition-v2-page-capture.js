/**
 * Immutable rendered-page evidence capture for fetch service v2.
 *
 * This script deliberately performs no content selection. It captures one
 * bounded page state that independent extension-side candidates can parse.
 */
(function installHomebaseAcquisitionV2Capture() {
  if (globalThis.workbenchCapturePageEvidenceV2) return;

  const MAX_HTML_CHARS = 1_500_000;
  const MAX_VISIBLE_TEXT_CHARS = 180_000;
  const MAX_SEMANTIC_TEXT_CHARS = 180_000;
  const MAX_JSON_LD_ITEMS = 12;
  const MAX_JSON_LD_CHARS = 80_000;
  const MAX_TRANSCRIPT_CHARS = 180_000;

  function cleanText(value) {
    return String(value || '')
      .replace(/\u00a0/g, ' ')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/[ \t]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  function metaContent(names) {
    for (const name of names) {
      const selector = `meta[property="${name}"], meta[name="${name}"]`;
      const value = document.querySelector(selector)?.getAttribute('content')?.trim();
      if (value) return value;
    }
    return undefined;
  }

  function absoluteHttpUrl(value) {
    if (!value) return undefined;
    try {
      const parsed = new URL(value, document.baseURI);
      return /^https?:$/.test(parsed.protocol) ? parsed.href : undefined;
    } catch {
      return undefined;
    }
  }

  function collectJsonLd() {
    const rows = [];
    let chars = 0;
    for (const node of document.querySelectorAll('script[type="application/ld+json"]')) {
      const text = node.textContent?.trim();
      if (!text) continue;
      const included = text.slice(0, Math.max(0, MAX_JSON_LD_CHARS - chars));
      if (!included) break;
      rows.push(included);
      chars += included.length;
      if (rows.length >= MAX_JSON_LD_ITEMS || chars >= MAX_JSON_LD_CHARS) break;
    }
    return rows;
  }

  function structuredTitle(jsonLdRows) {
    const visit = (value) => {
      if (!value || typeof value !== 'object') return undefined;
      if (Array.isArray(value)) {
        for (const row of value) {
          const found = visit(row);
          if (found) return found;
        }
        return undefined;
      }
      for (const key of ['headline', 'name']) {
        const candidate = cleanText(value[key]);
        if (candidate.length >= 4 && candidate.length <= 300) return candidate;
      }
      return visit(value['@graph']);
    };
    for (const row of jsonLdRows) {
      try {
        const found = visit(JSON.parse(row));
        if (found) return found;
      } catch {
        // Invalid JSON-LD is still retained as evidence for downstream parsing.
      }
    }
    return undefined;
  }

  function primaryHeadingTitle() {
    const selectors = [
      'main h1', 'article h1', '[role="main"] h1',
      '[role="heading"][aria-level="1"]', 'h1',
      'main h2', 'article h2', '[role="main"] h2', 'h2',
    ];
    for (const selector of selectors) {
      for (const node of document.querySelectorAll(selector)) {
        const style = getComputedStyle(node);
        if (style.display === 'none' || style.visibility === 'hidden') continue;
        const value = cleanText(node.innerText || node.textContent);
        if (value.length >= 4 && value.length <= 300) return value;
      }
    }
    return undefined;
  }

  function collectMetadata() {
    const canonical = document.querySelector('link[rel="canonical"]')?.getAttribute('href');
    const authorNode = document.querySelector('[rel="author"], meta[name="author"]');
    const author = authorNode?.tagName === 'META'
      ? authorNode.getAttribute('content')
      : authorNode?.textContent;
    const published =
      document.querySelector('meta[property="article:published_time"]')?.getAttribute('content') ||
      document.querySelector('time[datetime]')?.getAttribute('datetime') ||
      undefined;
    const jsonLd = collectJsonLd();
    return {
      title: metaContent(['og:title', 'twitter:title']) || cleanText(document.title) || undefined,
      structuredTitle: structuredTitle(jsonLd),
      headingTitle: primaryHeadingTitle(),
      description: metaContent(['og:description', 'description', 'twitter:description']),
      canonicalUrl: absoluteHttpUrl(canonical),
      previewImage: absoluteHttpUrl(metaContent(['og:image', 'twitter:image'])),
      author: cleanText(author) || undefined,
      published: cleanText(published) || undefined,
      jsonLd,
    };
  }

  function renderedVisibleText() {
    return cleanText(document.body?.innerText || document.body?.textContent).slice(0, MAX_VISIBLE_TEXT_CHARS);
  }

  function collectSemanticText() {
    const selectors = [
      'main', 'article', '[role="main"]', '[role="article"]',
      'h1', 'h2', 'h3', 'h4', 'p', 'li', 'blockquote', 'pre', 'code',
      'table', 'figcaption', 'details', 'summary', 'dl',
    ].join(',');
    const seen = new Set();
    const rows = [];
    let chars = 0;
    for (const node of document.querySelectorAll(selectors)) {
      if (!(node instanceof HTMLElement)) continue;
      const style = getComputedStyle(node);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      const rect = node.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) continue;
      const text = cleanText(node.innerText || node.textContent);
      if (text.length < 2 || seen.has(text)) continue;
      // Avoid duplicating a whole main/article wrapper and all of its children.
      if (text.length > 8_000 && node.querySelector('p, li, h1, h2, h3')) continue;
      seen.add(text);
      const tag = node.tagName.toLowerCase();
      const prefix = /^h[1-4]$/.test(tag) ? `${'#'.repeat(Number(tag[1]))} ` : '';
      const row = `${prefix}${text}`;
      const included = row.slice(0, Math.max(0, MAX_SEMANTIC_TEXT_CHARS - chars));
      if (!included) break;
      rows.push(included);
      chars += included.length + 2;
      if (chars >= MAX_SEMANTIC_TEXT_CHARS) break;
    }
    return rows.join('\n\n').trim();
  }

  function appendOpenShadowEvidence(clone) {
    const rows = [];
    for (const element of document.querySelectorAll('*')) {
      if (!element.shadowRoot) continue;
      const text = cleanText(element.shadowRoot.textContent);
      if (text.length >= 20) rows.push(text.slice(0, 12_000));
      if (rows.join('\n').length >= 60_000) break;
    }
    if (!rows.length || !clone.body) return;
    const section = clone.createElement('section');
    section.setAttribute('data-homebase-open-shadow-evidence', 'true');
    const heading = clone.createElement('h2');
    heading.textContent = 'Embedded page content';
    section.appendChild(heading);
    const paragraph = clone.createElement('p');
    paragraph.textContent = rows.join('\n\n').slice(0, 60_000);
    section.appendChild(paragraph);
    clone.body.appendChild(section);
  }

  function serializedClone() {
    const clone = document.cloneNode(true);
    clone.querySelectorAll('script:not([type="application/ld+json"]), style, noscript').forEach((node) => node.remove());
    clone.querySelectorAll('*').forEach((node) => {
      for (const attribute of [...node.attributes]) {
        if (/^on/i.test(attribute.name)) node.removeAttribute(attribute.name);
      }
    });
    appendOpenShadowEvidence(clone);
    return '<!doctype html>\n' + clone.documentElement.outerHTML;
  }

  function transcriptText() {
    const selectors = [
      'ytd-transcript-renderer',
      'ytd-transcript-segment-renderer',
      '[data-testid*="transcript" i]',
      '[class*="transcript" i]',
      '[id*="transcript" i]',
      'track[kind="captions"]',
      'track[kind="subtitles"]',
    ];
    const seen = new Set();
    const rows = [];
    for (const node of document.querySelectorAll(selectors.join(','))) {
      const text = cleanText(node.innerText || node.textContent);
      if (text.length < 20 || seen.has(text)) continue;
      seen.add(text);
      rows.push(text);
      if (rows.join('\n').length >= MAX_TRANSCRIPT_CHARS) break;
    }
    return rows.join('\n').slice(0, MAX_TRANSCRIPT_CHARS).trim();
  }

  function isYouTubeWatchPage() {
    const host = location.hostname.replace(/^www\./, '').toLowerCase();
    return (host === 'youtube.com' || host === 'm.youtube.com') && /\/watch\b/.test(location.pathname);
  }

  async function revealYouTubeTranscriptIfAllowed(allowInteraction) {
    if (!allowInteraction || !isYouTubeWatchPage() || transcriptText()) return;
    const controls = [...document.querySelectorAll('button, tp-yt-paper-item, ytd-button-renderer')];
    const control = controls.find((node) => /^(show\s+transcript|transcript)$/i.test(cleanText(node.innerText || node.textContent)));
    if (!control || typeof control.click !== 'function') return;
    control.click();
    const startedAt = Date.now();
    while (Date.now() - startedAt < 2_500) {
      if (transcriptText()) return;
      await new Promise((resolve) => setTimeout(resolve, 150));
    }
  }

  globalThis.workbenchCapturePageEvidenceV2 = async function capturePageEvidenceV2(options) {
    await revealYouTubeTranscriptIfAllowed(Boolean(options?.allowTranscriptInteraction));
    const transcript = transcriptText();
    const html = serializedClone();
    return {
      ok: true,
      url: location.href,
      title: cleanText(document.title) || undefined,
      html: html.slice(0, MAX_HTML_CHARS),
      visibleText: renderedVisibleText(),
      semanticText: collectSemanticText(),
      metadata: collectMetadata(),
      transcript: transcript || undefined,
      transcriptState: transcript ? 'available' : (isYouTubeWatchPage() ? 'not_available' : 'not_applicable'),
      truncated: html.length > MAX_HTML_CHARS,
    };
  };
})();
