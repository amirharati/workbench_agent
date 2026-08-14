/**
 * Injected into the user's tab for Mode B (tab-session) fetch.
 * Must stay self-contained — no imports.
 */
(function () {
  var MIN_MARKDOWN_CHARS = 80;
  var WAIT_MS = 2500;
  var POLL_MS = 150;

  var X_ERROR_RE =
    /something went wrong|let'?s give it another shot|this post is unavailable|you'?re unable to view this|protected posts only|rate limit exceeded|privacy related extensions/i;

  function cleanText(value) {
    return (value || '').replace(/\s+/g, ' ').trim();
  }

  function metaContent(name) {
    var el =
      document.querySelector('meta[property="' + name + '"]') ||
      document.querySelector('meta[name="' + name + '"]');
    return cleanText(el && el.getAttribute('content'));
  }

  function isGmailHost() {
    return location.hostname === 'mail.google.com';
  }

  function extractGmail() {
    var subject =
      cleanText(
        (document.querySelector('h2.hP') || document.querySelector('.hP'))?.innerText
      ) ||
      metaContent('og:title') ||
      cleanText(document.title);

    var bodySelectors = [
      '.a3s.aiL',
      'div.a3s',
      'div[data-message-id] .a3s',
      '.ii.gt',
      '[role="listitem"] .a3s',
      '[aria-label="Message Body"]',
    ];

    var chunks = [];
    var seen = {};
    for (var s = 0; s < bodySelectors.length; s++) {
      var nodes = document.querySelectorAll(bodySelectors[s]);
      for (var n = 0; n < nodes.length; n++) {
        var text = cleanText(nodes[n].innerText || nodes[n].textContent);
        if (text.length < 24 || seen[text]) continue;
        seen[text] = true;
        chunks.push(text);
      }
      if (chunks.join('\n\n').length >= MIN_MARKDOWN_CHARS) break;
    }

    var body = chunks.join('\n\n').slice(0, 12000);
    if (body.length >= MIN_MARKDOWN_CHARS) {
      var markdown = (subject ? '# ' + subject + '\n\n' : '') + body;
      return { ok: true, title: subject || document.title, markdown: markdown };
    }

    var main = document.querySelector('[role="main"]');
    if (main) {
      var clone = main.cloneNode(true);
      var remove = clone.querySelectorAll('script, style, noscript, svg, iframe, nav, header');
      for (var i = 0; i < remove.length; i++) remove[i].remove();
      var mainText = cleanText(clone.innerText || clone.textContent).slice(0, 12000);
      if (mainText.length >= MIN_MARKDOWN_CHARS) {
        var md = (subject ? '# ' + subject + '\n\n' : '') + mainText;
        return { ok: true, title: subject || document.title, markdown: md };
      }
    }

    if (subject && subject.length >= 12) {
      return {
        ok: true,
        title: subject,
        markdown: '# ' + subject + '\n\n(Gmail — open message body could not be read; subject saved.)',
      };
    }

    return { ok: false, error: 'gmail_body_missing', detail: 'Could not read Gmail message body' };
  }

  function waitForGmailBody() {
    return new Promise(function (resolve) {
      var start = Date.now();
      function tick() {
        var subject = cleanText(
          (document.querySelector('h2.hP') || document.querySelector('.hP'))?.innerText
        );
        var bodyNode = document.querySelector('.a3s.aiL, div.a3s, .ii.gt');
        var body = cleanText(bodyNode && (bodyNode.innerText || bodyNode.textContent));
        if ((subject && subject.length >= 8) || body.length >= MIN_MARKDOWN_CHARS) {
          return resolve(true);
        }
        if (Date.now() - start >= WAIT_MS) return resolve(false);
        setTimeout(tick, POLL_MS);
      }
      tick();
    });
  }

  function mainRoot() {
    return (
      document.querySelector('main') ||
      document.querySelector('[role="main"]') ||
      document.body
    );
  }

  function isLikelyListingPage() {
    var path = (location.pathname || '/').replace(/\/+$/, '').toLowerCase() || '/';
    if (path.indexOf('/comments/') >= 0) return false;
    if (isRedditHost() && /\/r\/[^/]+/.test(path) && path.indexOf('/comments/') < 0) return true;
    if (
      /^\/(category|categories|tag|tags|topic|topics|forum|forums|discussions|community|communities|feed|archive|archives|news|blog|blogs|posts)(\/|$)/.test(
        path
      ) ||
      /\/(category|tag|topics|forum|news|blog|feed)\/[^/]+\/?$/.test(path)
    ) {
      return !/\/(\d{4}\/\d{2}\/|article|story|p\/|post\/|posts\/[^/]+)/.test(path);
    }
    return false;
  }

  function pushListingItem(items, seen, item) {
    var title = cleanText(item.title);
    if (!title || title.length < 4 || title.length > 200) return;
    var key = title.toLowerCase();
    if (seen[key]) return;
    seen[key] = true;
    items.push({
      title: title,
      meta: cleanText(item.meta),
      body: cleanText(item.body).slice(0, 450),
    });
  }

  function extractRedditListingItems(items, seen, maxItems) {
    var shreddits = document.querySelectorAll('shreddit-post');
    for (var i = 0; i < shreddits.length && items.length < maxItems; i++) {
      var el = shreddits[i];
      pushListingItem(items, seen, {
        title:
          el.getAttribute('post-title') ||
          cleanText(
            (el.querySelector('[slot="title"], a[data-testid="post-title"]') || {}).innerText
          ),
        meta: cleanText(
          el.getAttribute('author') ||
            (el.querySelector('a[href*="/user/"], a[href*="/u/"]') || {}).innerText
        ).replace(/^u\//, ''),
        body: cleanText(
          (
            el.querySelector(
              '[slot="text-body"], [data-testid="post-content"], div[id*="post-rtjson-content"], .md'
            ) || {}
          ).innerText
        ),
      });
    }

    if (items.length < 2) {
      var titleLinks = document.querySelectorAll('a[data-testid="post-title"]');
      for (var j = 0; j < titleLinks.length && items.length < maxItems; j++) {
        var titleEl = titleLinks[j];
        var card = titleEl.closest('shreddit-post, article, [data-testid="post-container"]');
        pushListingItem(items, seen, {
          title: titleEl.innerText || titleEl.textContent,
          meta: cleanText(
            (card && card.querySelector('a[href*="/user/"], a[href*="/u/"]') || {}).innerText
          ).replace(/^u\//, ''),
          body: cleanText(
            (
              (card &&
                card.querySelector(
                  '[data-testid="post-content"], div[id*="post-rtjson-content"], .md'
                )) ||
              {}
            ).innerText
          ),
        });
      }
    }
  }

  function extractArticleListingItems(items, seen, maxItems) {
    var root = mainRoot();
    if (!root) return;
    var articles = root.querySelectorAll('article');
    for (var i = 0; i < articles.length && items.length < maxItems; i++) {
      var article = articles[i];
      var titleEl =
        article.querySelector('h1, h2, h3, h4, [class*="title" i] a') ||
        article.querySelector('a[href]');
      pushListingItem(items, seen, {
        title: cleanText(titleEl && (titleEl.innerText || titleEl.textContent)),
        meta: cleanText(
          (
            article.querySelector(
              'time, [class*="author" i], [class*="byline" i], [rel="author"]'
            ) || {}
          ).innerText
        ),
        body: cleanText(
          (
            article.querySelector(
              'p, [class*="summary" i], [class*="excerpt" i], [class*="description" i]'
            ) || {}
          ).innerText
        ),
      });
    }
  }

  function extractHeadingListingItems(items, seen, maxItems) {
    var root = mainRoot();
    if (!root) return;
    var headings = root.querySelectorAll('h2, h3');
    for (var i = 0; i < headings.length && items.length < maxItems; i++) {
      var heading = headings[i];
      var title = cleanText(heading.innerText || heading.textContent);
      if (!title || title.length < 6) continue;
      var chunks = [];
      var sib = heading.nextElementSibling;
      while (sib && !/^H[1-3]$/.test(sib.tagName)) {
        if (sib.matches && sib.matches('p, li, blockquote, div')) {
          var text = cleanText(sib.innerText || sib.textContent);
          if (text.length >= 20 && text.length <= 600) chunks.push(text);
        }
        sib = sib.nextElementSibling;
        if (chunks.join(' ').length >= 450) break;
      }
      pushListingItem(items, seen, {
        title: title,
        body: chunks.join(' ').slice(0, 450),
      });
    }
  }

  function extractListListingItems(items, seen, maxItems) {
    var root = mainRoot();
    if (!root) return;
    var lis = root.querySelectorAll('li');
    for (var i = 0; i < lis.length && items.length < maxItems; i++) {
      var li = lis[i];
      var link = li.querySelector('a[href]');
      var title = cleanText((link && link.innerText) || (li.querySelector('strong') || {}).innerText);
      var body = cleanText(li.innerText || li.textContent);
      if (!title || body.length < 24) continue;
      pushListingItem(items, seen, {
        title: title,
        body: body.length > title.length + 10 ? body.slice(0, 450) : '',
      });
    }
  }

  function collectListingItems() {
    var maxItems = 24;
    var batches = [
      (function () {
        var items = [];
        var seen = {};
        extractRedditListingItems(items, seen, maxItems);
        return items;
      })(),
      (function () {
        var items = [];
        var seen = {};
        extractArticleListingItems(items, seen, maxItems);
        return items;
      })(),
      (function () {
        var items = [];
        var seen = {};
        extractHeadingListingItems(items, seen, maxItems);
        return items;
      })(),
      (function () {
        var items = [];
        var seen = {};
        extractListListingItems(items, seen, maxItems);
        return items;
      })(),
    ];

    var best = [];
    for (var b = 0; b < batches.length; b++) {
      if (batches[b].length > best.length) best = batches[b];
    }
    return best;
  }

  function shouldPreferListing(items) {
    if (items.length >= 3) return true;
    if (items.length >= 2 && isLikelyListingPage()) return true;
    return false;
  }

  function isVideoWatchPage() {
    var host = location.hostname.replace(/^www\./, '').toLowerCase();
    if (host === 'youtu.be') return true;
    if (host === 'youtube.com' || host === 'm.youtube.com') {
      return /\/watch\b/.test(location.pathname) || location.search.indexOf('v=') >= 0;
    }
    if (host === 'vimeo.com') {
      return /^\/\d+/.test(location.pathname) || /\/video\//.test(location.pathname);
    }
    if (host === 'twitch.tv') {
      return /\/videos\//.test(location.pathname) || /\/clip\//.test(location.pathname);
    }
    return false;
  }

  function extractVideoPage() {
    var title =
      cleanText(
        (
          document.querySelector(
            'h1.ytd-watch-metadata, h1.ytd-video-primary-info-renderer, #title h1, h1[data-testid="video-title"], h1'
          ) || {}
        ).innerText
      ) ||
      metaContent('og:title') ||
      metaContent('twitter:title') ||
      cleanText(document.title);
    title = title.replace(/\s*-\s*(?:YouTube|Vimeo|Twitch|Watch|Video)\s*$/i, '');

    var channel = cleanText(
      (
        document.querySelector(
          '#channel-name a, ytd-channel-name a, #owner #channel-name a, ytd-video-owner-renderer a, [data-testid="channel-name"], a[href*="/@" i], a[href*="/channel/"]'
        ) || {}
      ).innerText ||
        (document.querySelector('meta[name="author"]') || {}).getAttribute('content')
    );

    var metaLine = cleanText(
      (
        document.querySelector(
          'ytd-video-view-count-renderer, #info-container span.view-count, #info-strings yt-formatted-string, [data-testid="view-count"]'
        ) || {}
      ).innerText
    );

    var description =
      metaContent('og:description') ||
      metaContent('description') ||
      metaContent('twitter:description');
    var descEl = document.querySelector(
      'ytd-text-inline-expander #snippets, ytd-expandable-video-description-body #snippets, #description-inline-expander yt-attributed-string, #description yt-attributed-string, ytd-structured-description-content-renderer, [data-testid="description"], .description, #watch-description'
    );
    if (descEl) {
      var domDesc = cleanText(descEl.innerText || descEl.textContent);
      if (domDesc.length > (description || '').length) description = domDesc;
    }

    var lines = [];
    if (title) lines.push('# ' + title);
    if (channel) lines.push('Channel: ' + channel);
    if (metaLine) lines.push(metaLine);
    if (description && description.length >= 20) {
      lines.push('', '## Description', '', description);
    }

    var markdown = lines.join('\n').trim();
    if (!description && markdown.length < MIN_MARKDOWN_CHARS) return null;
    if (markdown.length < 40 && !(description && description.length >= 20)) return null;
    return { ok: true, title: title || document.title, markdown: markdown };
  }

  function extractListingPage() {
    if (isVideoWatchPage()) return null;
    var items = collectListingItems();
    if (!shouldPreferListing(items)) return null;
    if (items.length < 2) return null;

    var pageTitle = metaContent('og:title') || cleanText(document.title) || 'Page listing';
    var lines = ['# ' + pageTitle, '', 'Items on this page (' + items.length + '):', ''];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      lines.push('## ' + item.title + (item.meta ? ' — ' + item.meta : ''));
      if (item.body) lines.push(item.body);
      lines.push('');
    }
    return { ok: true, title: pageTitle, markdown: lines.join('\n').trim() };
  }

  function isRedditHost() {
    return location.hostname.includes('reddit.com');
  }

  function isXHost() {
    var host = location.hostname.replace(/^www\./, '');
    return host === 'x.com' || host === 'twitter.com';
  }

  function isXErrorShell(text) {
    var body = cleanText(text);
    if (!body) return true;
    if (!X_ERROR_RE.test(body)) return false;
    var tweets = tweetTextsFromDom();
    if (tweets.length && tweets.join(' ').length >= MIN_MARKDOWN_CHARS) return false;
    return true;
  }

  function sleep(ms) {
    return new Promise(function (resolve) {
      setTimeout(resolve, ms);
    });
  }

  function tweetTextsFromDom() {
    var nodes = Array.from(document.querySelectorAll('[data-testid="tweetText"]'));
    return nodes
      .map(function (el) {
        return cleanText(el.innerText || el.textContent);
      })
      .filter(function (text) {
        return text.length >= 8 && !isXErrorShell(text);
      });
  }

  function waitForTweetTexts() {
    return new Promise(function (resolve) {
      var start = Date.now();
      function tick() {
        var texts = tweetTextsFromDom();
        if (texts.length) return resolve(texts);
        if (Date.now() - start >= WAIT_MS) return resolve([]);
        setTimeout(tick, POLL_MS);
      }
      tick();
    });
  }

  function handleFromArticle(article) {
    var userEl =
      article.querySelector('[data-testid="User-Name"] a[href*="/"]') ||
      article.querySelector('a[href^="/"][role="link"]');
    if (!userEl) return '';
    var href = userEl.getAttribute('href') || '';
    var match = href.match(/^\/([^/?#]+)/);
    return match ? '@' + match[1] : cleanText(userEl.innerText || userEl.textContent);
  }

  /** Main tweet text plus embedded quote tweet when present in the same article card. */
  function tweetBodyFromArticle(article) {
    var textEls = article.querySelectorAll('[data-testid="tweetText"]');
    var parts = [];
    var main = textEls.length
      ? cleanText(textEls[0].innerText || textEls[0].textContent)
      : '';
    if (main && !isXErrorShell(main)) parts.push(main);

    if (textEls.length >= 2) {
      var quoted = cleanText(
        textEls[textEls.length - 1].innerText || textEls[textEls.length - 1].textContent
      );
      if (quoted && quoted !== main && !isXErrorShell(quoted)) {
        parts.push('> Quote:\n> ' + quoted.replace(/\n/g, '\n> '));
      }
    }

    var seenLinks = {};
    var links = article.querySelectorAll('a[href]');
    for (var i = 0; i < links.length && Object.keys(seenLinks).length < 5; i++) {
      var href = links[i].href || links[i].getAttribute('href') || '';
      if (!/^https?:\/\//i.test(href)) continue;
      try {
        var host = new URL(href).hostname.replace(/^www\./, '').toLowerCase();
        if (host === 'x.com' || host === 'twitter.com') continue;
      } catch (e) {
        continue;
      }
      if (seenLinks[href]) continue;
      seenLinks[href] = true;
      parts.push('Link: ' + href);
    }

    var seenMedia = {};
    var images = article.querySelectorAll('img[src*="pbs.twimg.com/media"], img[src*="twimg.com/media"]');
    for (var j = 0; j < images.length && j < 8; j++) {
      var src = images[j].src || images[j].getAttribute('src') || '';
      if (!src || seenMedia[src]) continue;
      seenMedia[src] = true;
      parts.push('Image: ' + src);
    }
    var videos = article.querySelectorAll('video[poster]');
    for (var k = 0; k < videos.length && k < 4; k++) {
      var poster = videos[k].poster || videos[k].getAttribute('poster') || '';
      if (!poster || seenMedia[poster]) continue;
      seenMedia[poster] = true;
      parts.push('Video poster: ' + poster);
    }

    return parts.join('\n\n').trim();
  }

  function collectXArticleEntries(entries, seen) {
    var articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    for (var i = 0; i < articles.length && entries.length < 20; i++) {
      var body = tweetBodyFromArticle(articles[i]);
      if (!body) continue;
      var handle = handleFromArticle(articles[i]);
      var key = handle + '\n' + body;
      if (seen[key]) continue;
      seen[key] = true;
      entries.push({ body: body, handle: handle });
    }
  }

  async function extractXWithBoundedScroll() {
    var entries = [];
    var seen = {};
    collectXArticleEntries(entries, seen);

    var root = document.documentElement;
    var viewport = window.innerHeight || 0;
    var canScroll = root && root.scrollHeight > viewport + 100 && typeof window.scrollBy === 'function';
    for (var pass = 0; canScroll && pass < 4 && entries.length < 20; pass++) {
      var before = entries.length;
      window.scrollBy(0, Math.max(600, Math.floor(viewport * 0.8)));
      await sleep(450);
      collectXArticleEntries(entries, seen);
      if (entries.length === before && pass >= 1) break;
    }

    if (!entries.length) return null;
    return extractXFromTexts(
      entries.map(function (entry) { return entry.body; }),
      entries.map(function (entry) { return entry.handle; })
    );
  }

  function extractXFromTexts(texts, handlesHint) {
    if (!texts.length) return null;

    var parts = [];
    var handles = handlesHint ? handlesHint.slice() : [];

    for (var i = 0; i < texts.length; i++) {
      var text = texts[i];
      var handle = handles[i] || handles[0] || '';
      var section =
        texts.length === 1
          ? text
          : '## ' +
            (i + 1) +
            '/' +
            texts.length +
            '\n\n' +
            (handle ? handle + '\n\n' : '') +
            text;
      parts.push(section);
    }

    var author = handles[0] || '@unknown';
    var header =
      parts.length > 1
        ? '# ' + author + ' — thread (' + parts.length + ' parts)'
        : '# ' + author;
    var markdown = [header, ''].concat(parts).join('\n\n');
    var firstLine = cleanText(parts[0].split('\n').pop());
    var title =
      parts.length > 1
        ? author + ': ' + firstLine.slice(0, 60) + '… (' + parts.length + ' parts)'
        : author + ': ' + firstLine.slice(0, 80);

    return { ok: true, title: title, markdown: markdown };
  }

  function extractXFromArticles() {
    var articles = Array.from(document.querySelectorAll('article[data-testid="tweet"]'));
    if (!articles.length) return null;

    var texts = [];
    var handles = [];
    for (var i = 0; i < articles.length; i++) {
      var article = articles[i];
      var text = tweetBodyFromArticle(article);
      if (!text) continue;
      texts.push(text);
      handles.push(handleFromArticle(article));
    }
    return extractXFromTexts(texts, handles);
  }

  function extractXFromPrimaryColumn() {
    var col = document.querySelector('[data-testid="primaryColumn"]');
    if (!col) return null;
    var clone = col.cloneNode(true);
    var remove = clone.querySelectorAll(
      'script, style, noscript, svg, iframe, nav, header, [data-testid="sidebarColumn"]'
    );
    for (var i = 0; i < remove.length; i++) remove[i].remove();
    var body = cleanText(clone.innerText || clone.textContent);
    if (body.length < MIN_MARKDOWN_CHARS || isXErrorShell(body)) return null;
    var title = metaContent('og:title') || cleanText(document.title);
    return { ok: true, title: title || document.title, markdown: body.slice(0, 12000) };
  }

  function extractX() {
    var fromArticles = extractXFromArticles();
    if (fromArticles && fromArticles.markdown.length >= MIN_MARKDOWN_CHARS) return fromArticles;

    var texts = tweetTextsFromDom();
    if (texts.length) {
      var fromTexts = extractXFromTexts(texts, []);
      if (fromTexts && fromTexts.markdown.length >= MIN_MARKDOWN_CHARS) return fromTexts;
    }

    var fromColumn = extractXFromPrimaryColumn();
    if (fromColumn) return fromColumn;

    if (fromArticles && fromArticles.markdown.length >= 20) {
      return {
        ok: false,
        error: 'tweet_too_short',
        detail: 'Tweet found but text is too short — wait for the page to finish loading',
      };
    }

    return {
      ok: false,
      error: 'no_tweet_content',
      detail: 'Could not read tweet text from the open tab',
    };
  }

  function extractGeneric() {
    var title = metaContent('og:title') || cleanText(document.title);
    var description = metaContent('og:description') || metaContent('description');
    var parts = [];
    if (title) parts.push('# ' + title);
    if (description) parts.push(description);

    var main =
      document.querySelector('main') ||
      document.querySelector('[role="main"]');
    if (main) {
      var clone = main.cloneNode(true);
      var remove = clone.querySelectorAll(
        'script, style, noscript, svg, iframe, nav, footer, header'
      );
      for (var i = 0; i < remove.length; i++) remove[i].remove();
      var body = cleanText(clone.innerText || clone.textContent).slice(0, 8000);
      if (body.length >= MIN_MARKDOWN_CHARS) parts.push(body);
    }

    if (!parts.length) {
      var fallback = cleanText(document.body && document.body.innerText).slice(0, 8000);
      if (fallback.length >= MIN_MARKDOWN_CHARS) parts.push(fallback);
    }

    var markdown = parts.join('\n\n').trim();
    if (markdown.length < MIN_MARKDOWN_CHARS) {
      return { ok: false, error: 'page_too_short' };
    }
    return { ok: true, title: title || document.title, markdown: markdown };
  }

  function extractLocalFile() {
    if (location.protocol !== 'file:') return null;
    var pathName = '';
    try {
      pathName = decodeURIComponent(location.pathname.split('/').filter(Boolean).pop() || '');
    } catch (e) {
      pathName = (location.pathname.split('/').pop() || '').replace(/%20/g, ' ');
    }
    var title = cleanText(document.title) || pathName || 'Local file';
    var body = cleanText(document.body && (document.body.innerText || document.body.textContent));
    if (body.length >= MIN_MARKDOWN_CHARS) {
      var md = (title ? '# ' + title + '\n\n' : '') + body.slice(0, 12000);
      return { ok: true, title: title, markdown: md };
    }
    var note =
      pathName && /\.pdf$/i.test(pathName)
        ? '(Local PDF — Chrome viewer exposes little text; summary may use the filename and any visible text.)'
        : '(Local file — little readable text in the tab; summary may use the title.)';
    return {
      ok: true,
      title: title,
      markdown: '# ' + title + '\n\n' + note,
    };
  }

  function runExtract() {
    try {
      var localFile = extractLocalFile();
      if (localFile) return localFile;
      if (isXHost()) return extractX();
      if (isGmailHost()) return extractGmail();
      if (isVideoWatchPage()) {
        var video = extractVideoPage();
        if (video) return video;
      }
      var listing = extractListingPage();
      if (listing) return listing;
      return extractGeneric();
    } catch (e) {
      return { ok: false, error: String(e && e.message ? e.message : e) };
    }
  }

  window.workbenchExtractPageContent = function workbenchExtractPageContent() {
    return runExtract();
  };

  window.workbenchExtractPageContentAsync = async function workbenchExtractPageContentAsync() {
    if (isXHost()) {
      await waitForTweetTexts();
      // Re-read article cards after waiting so author handles and quote/thread
      // structure are retained. Returning the raw text list here labeled every
      // authenticated post as @unknown, causing the safety gate to reject it.
      return (await extractXWithBoundedScroll()) || extractX();
    }
    if (isGmailHost()) {
      await waitForGmailBody();
    }
    return runExtract();
  };
})();
