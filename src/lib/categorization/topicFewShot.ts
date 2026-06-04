/** Few-shot examples — ids match seed_* leaf ids in categories.seed.json */

export const TOPIC_FEW_SHOT = [
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
      topicIds: ['seed_algo-trading-platforms', 'seed_trading-strategies-education'],
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
      topicIds: ['seed_sexuality-wellness-education'],
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
      topicIds: ['seed_government-forms-requests'],
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
