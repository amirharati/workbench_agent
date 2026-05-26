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
    title: 'YouTube',
    summary: '',
    output: {
      skip: true,
      topicIds: [],
      proposed: [],
      confidence: 0.95,
      reason: 'Generic login/home — no topic.',
    },
  },
];
