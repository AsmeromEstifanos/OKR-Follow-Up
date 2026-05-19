import { apiPath } from "@/lib/base-path";

export type CommentCount = {
  count: number;
  latestAt: string;
  latestBody?: string;
  latestAuthor?: string;
  entityType?: "objective" | "kr";
  entityKey?: string;
  title?: string;
  code?: string;
  department?: string;
  parentObjectiveCode?: string;
  timestamps?: string[];
};

type CountsMap = Record<string, CommentCount>;

let cachedPromise: Promise<CountsMap> | null = null;

function fetchCounts(): Promise<CountsMap> {
  return fetch(apiPath("/api/comments/counts"), { cache: "no-store" })
    .then((res) => (res.ok ? res.json() : { counts: {} }))
    .then((data: { counts?: CountsMap }) => data.counts ?? {})
    .catch(() => ({}));
}

// Returns a tenant-wide map of comment counts, fetched once and shared across
// every ChatIconButton on the page so the board doesn't fire dozens of requests.
export function getCommentCounts(): Promise<CountsMap> {
  if (!cachedPromise) {
    cachedPromise = fetchCounts();
  }
  return cachedPromise;
}

export function invalidateCommentCounts(): void {
  cachedPromise = null;
}

export function commentCountKey(entityType: string, entityKey: string): string {
  return `${entityType}::${entityKey}`;
}
