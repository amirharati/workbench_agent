/** Few-shot examples — ids match seed_* leaf ids in categories.seed.json */

export const TOPIC_FEW_SHOT = [
  {
    title: 'Night Harbor - Season 2 Episode 4 Watch',
    summary:
      'A streaming episode page whose plot includes family conflict, addiction, and a dramatic fundraiser.',
    semanticAnalysis: {
      semanticLabel: 'Night Harbor TV episode',
      primarySubject: 'A streaming/watch page for one television episode',
      likelySavePurpose: 'Watch or return to this television episode',
      contentKind: 'TV episode page',
      secondaryThemes: ['family conflict', 'addiction', 'fundraiser drama'],
      freeTopics: ['television episode', 'drama series', 'streaming'],
      broadDomain: 'television and entertainment',
      evidence: 'The saved object is an episode page; plot relationships are secondary themes.',
      contentState: 'substantive',
    },
    output: {
      skip: false,
      primaryParentId: 'arts-media-entertainment',
      topicPaths: [['arts-media-entertainment', 'seed_movies-tv-streaming']],
      topicIds: ['seed_movies-tv-streaming'],
      parentCandidates: [
        { parentId: 'arts-media-entertainment', similarity: 0.97, reason: 'The primary saved object is a TV episode/watch page.' },
        { parentId: 'relationships-sexuality', similarity: 0.22, reason: 'Relationships occur only inside the episode plot.' },
        { parentId: 'health-medicine', similarity: 0.12, reason: 'Addiction is only a plot theme here.' },
      ],
      proposed: [],
      confidence: 0.96,
      reason: 'Classify the media object, not incidental plot themes.',
    },
  },
  {
    title: 'How to Resolve Recurring Family Conflict',
    summary:
      'A practical advice article about communication, boundaries, and recurring conflict between family members.',
    semanticAnalysis: {
      semanticLabel: 'Resolving family conflict',
      primarySubject: 'Advice for handling conflict in family relationships',
      likelySavePurpose: 'Use practical guidance for resolving family conflict',
      contentKind: 'relationship advice article',
      secondaryThemes: [],
      freeTopics: ['family relationships', 'conflict resolution', 'communication'],
      broadDomain: 'relationships and family',
      evidence: 'The page itself teaches family relationship skills rather than depicting them in fiction.',
      contentState: 'substantive',
    },
    output: {
      skip: false,
      primaryParentId: 'relationships-sexuality',
      topicPaths: [['relationships-sexuality', 'seed_relationships-family']],
      topicIds: ['seed_relationships-family'],
      parentCandidates: [
        { parentId: 'relationships-sexuality', similarity: 0.97, reason: 'Family conflict is the article’s direct subject.' },
        { parentId: 'arts-media-entertainment', similarity: 0.04, reason: 'This is not a creative work or entertainment page.' },
      ],
      proposed: [],
      confidence: 0.96,
      reason: 'The page purpose is relationship guidance.',
    },
  },
  {
    title: 'Growing on Purpose: Meaningful Work in the Age of AI',
    summary:
      'A discussion of human flourishing, personal values, meaningful work, and purpose as artificial intelligence changes professional life.',
    output: {
      skip: false,
      topicPaths: [['ai-productivity', 'seed_ai-productivity-general']],
      topicIds: ['seed_ai-productivity-general'],
      parentCandidates: [
        { parentId: 'ai-productivity', similarity: 0.82, reason: 'AI-driven work and productivity context.' },
        { parentId: 'history-philosophy-religion', similarity: 0.69, reason: 'Human flourishing and values.' },
        { parentId: 'personal-finance', similarity: 0.03, reason: 'No money, investing, tax, insurance, or retirement subject.' },
      ],
      proposed: [],
      confidence: 0.86,
      reason: 'AI and work are the domain; personal growth is not personal finance.',
    },
  },
  {
    title: 'A Practical Retirement Portfolio',
    summary:
      'How to allocate index funds, manage retirement savings, rebalance investments, and control portfolio risk.',
    output: {
      skip: false,
      topicPaths: [['personal-finance', 'seed_investing-retirement']],
      topicIds: ['seed_investing-retirement'],
      parentCandidates: [
        { parentId: 'personal-finance', similarity: 0.97, reason: 'Direct retirement and investment evidence.' },
        { parentId: 'quant-finance', similarity: 0.31, reason: 'Portfolio language, but no quantitative trading system.' },
      ],
      proposed: [],
      confidence: 0.94,
      reason: 'Explicit investing and retirement evidence supports Personal finance.',
    },
  },
  {
    title: 'Key Concepts in RL — Spinning Up documentation',
    summary: 'Intro to RL: policies, value functions, policy gradients, MDPs.',
    output: {
      skip: false,
      topicIds: ['seed_reinforcement-learning'],
      proposed: [],
      confidence: 0.92,
      reason: 'Core RL theory tutorial.',
    },
  },
  {
    title: 'QuantConnect - Open Source Algorithmic Trading Platform',
    summary: 'LEAN engine, backtesting, live algorithmic trading.',
    output: {
      skip: false,
      topicIds: ['seed_algorithmic-trading-backtesting', 'seed_markets-trading-strategies'],
      proposed: [],
      confidence: 0.9,
      reason: 'Algo platform plus systematic trading.',
    },
  },
  {
    title: 'How to Have Sex Dreams: Erotic Lucid Dreaming Explained',
    summary: 'Guide to inducing sex dreams and lucid dreaming for erotic dream control; wellness-focused article.',
    output: {
      skip: false,
      topicIds: ['seed_sexuality-sexual-health'],
      proposed: [],
      confidence: 0.88,
      reason: 'Sexuality/wellness education — not explicit adult video.',
    },
  },
  {
    title: "Girl licks man's feet and allows him to put leg on head",
    summary: 'Explicit adult video: dominance, fetish, sexual scene on tube site.',
    output: {
      skip: false,
      topicIds: ['seed_adult-erotic-content'],
      proposed: [],
      confidence: 0.9,
      reason: 'Explicit adult video — classify for library tracking.',
    },
  },
  {
    title: 'Market microstructure overview (practitioner blog)',
    summary: 'Broad quant markets perspective without a specific platform or strategy focus.',
    output: {
      skip: false,
      topicPaths: [['quant-finance', 'seed_quant-finance-general']],
      topicIds: ['seed_quant-finance-general'],
      proposed: [],
      confidence: 0.78,
      reason: 'Quant domain clear; no specific sibling leaf fits.',
    },
  },
  {
    title: '404 Page Not Found — NZXT Support',
    summary:
      'HTTP 404. The requested support article was not found. No product documentation body.',
    output: {
      skip: false,
      topicPaths: [['link-quality', 'seed_page-not-found']],
      topicIds: ['seed_page-not-found'],
      proposed: [],
      confidence: 0.94,
      reason: 'Dead link — error page only, not a topic.',
    },
  },
  {
    title: '500 Internal Server Error',
    summary:
      'nginx reports an internal server error. No article, documentation, or product content on the page.',
    output: {
      skip: false,
      topicPaths: [['link-quality', 'seed_page-not-found']],
      topicIds: ['seed_page-not-found'],
      proposed: [],
      confidence: 0.9,
      reason: '5xx error page — bookmark is broken/unreachable.',
    },
  },
  {
    title: 'Example Domain',
    summary: 'IANA reserved example.com placeholder; not real content.',
    output: {
      skip: false,
      topicPaths: [['link-quality', 'seed_placeholder-junk']],
      topicIds: ['seed_placeholder-junk'],
      proposed: [],
      confidence: 0.97,
      reason: 'Reserved example.com only — OK for placeholder-junk; real sites never go here.',
    },
  },
  {
    title: 'Old blog post (fetch failed)',
    summary: '',
    output: {
      skip: false,
      topicPaths: [['link-quality', 'seed_enrich-fetch-failed']],
      topicIds: ['seed_enrich-fetch-failed'],
      proposed: [],
      confidence: 0.88,
      reason: 'No usable summary — enrich or fetch failed.',
    },
  },
  {
    title: 'Working Free Movies and TV Shows Websites List - YarrList',
    summary:
      'Curated list of sites for free movies, TV shows, anime, sports streams, torrents, music, and related media; suggests VPN/ad blockers.',
    output: {
      skip: false,
      topicIds: ['seed_movies-tv-streaming'],
      proposed: [],
      confidence: 0.91,
      reason: 'Clear movies/TV/media topic — not link-quality.',
    },
  },
  {
    title: 'Immigrant Visa Process - U.S. Embassy & Consulates in Canada',
    summary:
      'Steps for immigrant visas: I-130/I-140 petition, NVC processing, interview, medical exam, post-visa procedures.',
    output: {
      skip: false,
      topicIds: ['seed_government-services-immigration'],
      proposed: [],
      confidence: 0.93,
      reason: 'Government immigration/visa guide — specific civic topic.',
    },
  },
  {
    title: 'YouTube',
    summary: 'Sign in to continue to YouTube. No video or channel topic in the text.',
    output: {
      skip: false,
      topicPaths: [['link-quality', 'seed_login-auth-required']],
      topicIds: ['seed_login-auth-required'],
      proposed: [],
      confidence: 0.9,
      reason: 'Login wall — keep for re-fetch when signed in; not removal junk.',
    },
  },
];
