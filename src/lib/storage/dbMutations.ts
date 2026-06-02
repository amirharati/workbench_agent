/** Tab→worker batch write ops applied in one SQLite transaction. */
export type DbMutation =
  | { kind: 'put'; storeName: string; value: unknown }
  | { kind: 'delete'; storeName: string; key: string };

export type BatchMutateResult = {
  applied: number;
  revision: number;
};
