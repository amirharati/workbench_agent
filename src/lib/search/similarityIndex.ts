export interface SimilarityVectorRecord {
  itemId: string;
  embeddingModel: string;
  embedding: ArrayLike<number>;
}

export interface SimilarityCapacityHint {
  embeddingModel: string;
  dimensions: number;
  count: number;
}

export interface SimilarityHit {
  itemId: string;
  /** Cosine similarity mapped from [-1, 1] to [0, 1]. */
  score: number;
}

export interface SimilarityQueryOptions {
  limit: number;
  excludeSelf?: boolean;
  allowedItemIds?: ReadonlySet<string>;
}

export interface SimilarityQueryResult {
  anchorHasEmbedding: boolean;
  hits: SimilarityHit[];
}

/**
 * Disposable, process-local vector index. SQLite remains the durable source.
 * The interface deliberately does not expose the flat-scan implementation so
 * a WASM/SIMD or ANN backend can replace it without changing callers.
 */
export interface SimilarityIndex {
  readonly ready: boolean;
  readonly size: number;
  load(records: Iterable<SimilarityVectorRecord>, capacityHints?: Iterable<SimilarityCapacityHint>): void;
  clear(): void;
  has(itemId: string): boolean;
  upsert(record: SimilarityVectorRecord): boolean;
  remove(itemId: string): boolean;
  query(itemId: string, options: SimilarityQueryOptions): SimilarityQueryResult;
}

type HeapHit = SimilarityHit;

function isBetter(left: HeapHit, right: HeapHit): boolean {
  return left.score > right.score || (left.score === right.score && left.itemId < right.itemId);
}

function isWorse(left: HeapHit, right: HeapHit): boolean {
  return left.score < right.score || (left.score === right.score && left.itemId > right.itemId);
}

class TopKHeap {
  private readonly heap: HeapHit[] = [];

  constructor(private readonly limit: number) {}

  push(hit: HeapHit): void {
    if (this.limit <= 0) return;
    if (this.heap.length < this.limit) {
      this.heap.push(hit);
      this.bubbleUp(this.heap.length - 1);
      return;
    }
    if (!isBetter(hit, this.heap[0])) return;
    this.heap[0] = hit;
    this.bubbleDown(0);
  }

  sorted(): HeapHit[] {
    return [...this.heap].sort((left, right) =>
      right.score - left.score || left.itemId.localeCompare(right.itemId)
    );
  }

  private bubbleUp(start: number): void {
    let index = start;
    while (index > 0) {
      const parent = Math.floor((index - 1) / 2);
      if (!isWorse(this.heap[index], this.heap[parent])) break;
      [this.heap[index], this.heap[parent]] = [this.heap[parent], this.heap[index]];
      index = parent;
    }
  }

  private bubbleDown(start: number): void {
    let index = start;
    while (true) {
      const left = index * 2 + 1;
      const right = left + 1;
      let worst = index;
      if (left < this.heap.length && isWorse(this.heap[left], this.heap[worst])) worst = left;
      if (right < this.heap.length && isWorse(this.heap[right], this.heap[worst])) worst = right;
      if (worst === index) return;
      [this.heap[index], this.heap[worst]] = [this.heap[worst], this.heap[index]];
      index = worst;
    }
  }
}

function shardKey(model: string, dimensions: number): string {
  return `${model}\u0000${dimensions}`;
}

function reserveFor(rowCount: number): number {
  if (rowCount <= 0) return 256;
  return rowCount + Math.max(256, Math.ceil(rowCount / 8));
}

class DenseVectorShard {
  readonly itemIds: string[] = [];
  readonly rowByItemId = new Map<string, number>();
  private matrix: Float32Array;

  constructor(readonly dimensions: number, initialRows = 0) {
    this.matrix = new Float32Array(reserveFor(initialRows) * dimensions);
  }

  get size(): number {
    return this.itemIds.length;
  }

  has(itemId: string): boolean {
    return this.rowByItemId.has(itemId);
  }

  upsert(itemId: string, embedding: ArrayLike<number>): boolean {
    if (!itemId || embedding.length !== this.dimensions) return false;
    let normSquared = 0;
    for (let i = 0; i < this.dimensions; i++) {
      const value = Number(embedding[i]);
      if (!Number.isFinite(value)) return false;
      normSquared += value * value;
    }
    if (!(normSquared > 0)) return false;

    let row = this.rowByItemId.get(itemId);
    if (row == null) {
      row = this.itemIds.length;
      this.ensureCapacity(row + 1);
      this.itemIds.push(itemId);
      this.rowByItemId.set(itemId, row);
    }

    const norm = Math.sqrt(normSquared);
    const offset = row * this.dimensions;
    for (let i = 0; i < this.dimensions; i++) {
      this.matrix[offset + i] = Number(embedding[i]) / norm;
    }
    return true;
  }

  remove(itemId: string): boolean {
    const row = this.rowByItemId.get(itemId);
    if (row == null) return false;
    const lastRow = this.itemIds.length - 1;
    const lastId = this.itemIds[lastRow];
    if (row !== lastRow) {
      const from = lastRow * this.dimensions;
      const to = row * this.dimensions;
      this.matrix.copyWithin(to, from, from + this.dimensions);
      this.itemIds[row] = lastId;
      this.rowByItemId.set(lastId, row);
    }
    this.itemIds.pop();
    this.rowByItemId.delete(itemId);
    return true;
  }

  query(anchorId: string, options: SimilarityQueryOptions): SimilarityHit[] {
    const anchorRow = this.rowByItemId.get(anchorId);
    if (anchorRow == null) return [];
    const limit = Math.max(0, Math.floor(options.limit));
    const heap = new TopKHeap(limit);
    const anchorOffset = anchorRow * this.dimensions;

    for (let row = 0; row < this.itemIds.length; row++) {
      const itemId = this.itemIds[row];
      if (options.excludeSelf !== false && itemId === anchorId) continue;
      if (options.allowedItemIds && !options.allowedItemIds.has(itemId)) continue;
      const offset = row * this.dimensions;
      let dot = 0;
      for (let i = 0; i < this.dimensions; i++) {
        dot += this.matrix[anchorOffset + i] * this.matrix[offset + i];
      }
      const score = Math.max(0, Math.min(1, (dot + 1) / 2));
      if (score > 0.05) heap.push({ itemId, score });
    }

    return heap.sorted();
  }

  private ensureCapacity(requiredRows: number): void {
    const currentRows = this.matrix.length / this.dimensions;
    if (requiredRows <= currentRows) return;
    const nextRows = Math.max(requiredRows, currentRows + 256, Math.ceil(currentRows * 1.25));
    const next = new Float32Array(nextRows * this.dimensions);
    next.set(this.matrix.subarray(0, this.itemIds.length * this.dimensions));
    this.matrix = next;
  }
}

export class WorkerSimilarityIndex implements SimilarityIndex {
  private readonly shards = new Map<string, DenseVectorShard>();
  private readonly shardKeyByItemId = new Map<string, string>();
  private loaded = false;

  get ready(): boolean {
    return this.loaded;
  }

  get size(): number {
    return this.shardKeyByItemId.size;
  }

  load(
    records: Iterable<SimilarityVectorRecord>,
    capacityHints: Iterable<SimilarityCapacityHint> = []
  ): void {
    this.clear();
    for (const hint of capacityHints) {
      if (!hint.embeddingModel || hint.dimensions <= 0 || hint.count <= 0) continue;
      this.shards.set(
        shardKey(hint.embeddingModel, hint.dimensions),
        new DenseVectorShard(hint.dimensions, hint.count)
      );
    }
    for (const record of records) {
      this.upsert(record);
    }
    this.loaded = true;
  }

  clear(): void {
    this.shards.clear();
    this.shardKeyByItemId.clear();
    this.loaded = false;
  }

  has(itemId: string): boolean {
    return this.shardKeyByItemId.has(itemId);
  }

  upsert(record: SimilarityVectorRecord): boolean {
    if (!record.itemId || !record.embedding?.length) {
      this.remove(record.itemId);
      return false;
    }
    const key = shardKey(record.embeddingModel, record.embedding.length);
    const previousKey = this.shardKeyByItemId.get(record.itemId);
    if (previousKey && previousKey !== key) {
      this.shards.get(previousKey)?.remove(record.itemId);
    }
    let shard = this.shards.get(key);
    if (!shard) {
      shard = new DenseVectorShard(record.embedding.length);
      this.shards.set(key, shard);
    }
    const stored = shard.upsert(record.itemId, record.embedding);
    if (stored) this.shardKeyByItemId.set(record.itemId, key);
    else {
      if (previousKey) this.shards.get(previousKey)?.remove(record.itemId);
      this.shardKeyByItemId.delete(record.itemId);
    }
    return stored;
  }

  remove(itemId: string): boolean {
    const key = this.shardKeyByItemId.get(itemId);
    if (!key) return false;
    const shard = this.shards.get(key);
    const removed = shard?.remove(itemId) ?? false;
    this.shardKeyByItemId.delete(itemId);
    if (shard?.size === 0) this.shards.delete(key);
    return removed;
  }

  query(itemId: string, options: SimilarityQueryOptions): SimilarityQueryResult {
    const key = this.shardKeyByItemId.get(itemId);
    const shard = key ? this.shards.get(key) : undefined;
    if (!shard) return { anchorHasEmbedding: false, hits: [] };
    return {
      anchorHasEmbedding: true,
      hits: shard.query(itemId, options),
    };
  }
}
