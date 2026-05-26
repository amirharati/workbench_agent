export function l2Normalize(v) {
  let sum = 0;
  for (const x of v) sum += x * x;
  const norm = Math.sqrt(sum) || 1;
  return v.map((x) => x / norm);
}

export function cosineSimilarity(a, b) {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot;
}

export function meanVector(vectors) {
  if (!vectors.length) return [];
  const dim = vectors[0].length;
  const acc = new Array(dim).fill(0);
  for (const v of vectors) {
    for (let i = 0; i < dim; i++) acc[i] += v[i] ?? 0;
  }
  return l2Normalize(acc.map((x) => x / vectors.length));
}

export function kMeans(vectors, k, maxIter = 25) {
  const n = vectors.length;
  if (n === 0) return { assignments: [], centroids: [] };
  const kk = Math.max(1, Math.min(k, n));
  const centroids = [];
  const step = Math.max(1, Math.floor(n / kk));
  for (let i = 0; i < kk; i++) centroids.push([...vectors[Math.min(i * step, n - 1)]]);
  const assignments = new Array(n).fill(0);

  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let best = 0;
      let bestScore = -Infinity;
      for (let c = 0; c < kk; c++) {
        const score = cosineSimilarity(vectors[i], centroids[c]);
        if (score > bestScore) {
          bestScore = score;
          best = c;
        }
      }
      if (assignments[i] !== best) {
        assignments[i] = best;
        changed = true;
      }
    }
    for (let c = 0; c < kk; c++) {
      const members = vectors.filter((_, i) => assignments[i] === c);
      if (members.length) centroids[c] = meanVector(members);
    }
    if (!changed) break;
  }
  return { assignments, centroids: centroids.map((c) => l2Normalize(c)) };
}

export function effectiveBootstrapK(itemCount, configuredK) {
  if (itemCount < 6) return Math.max(2, Math.min(3, itemCount));
  return Math.min(configuredK, Math.max(3, Math.round(Math.sqrt(itemCount / 2))));
}
