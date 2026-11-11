const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000/api/v1";

export interface Repository {
  id: string;
  github_owner: string;
  github_name: string;
  clone_url: string;
  default_branch: string;
  last_indexed_commit_sha?: string;
  status: "pending" | "cloning" | "parsing_ast" | "embedding" | "ready" | "failed";
  error_message?: string;
  total_files: number;
  total_chunks: number;
}

export interface TreeNode {
  name: string;
  type: "file" | "directory";
  path?: string;
  id?: string;
  language?: string;
  lines?: number;
  size?: number;
  children?: TreeNode[];
}

export interface FileDetail {
  id: string;
  file_path: string;
  language: string;
  line_count: number;
  content: string;
  symbols: {
    id: string;
    name: string;
    kind: string;
    signature: string;
    start_line: number;
    end_line: number;
  }[];
}

export interface SearchResultItem {
  chunk_id: string;
  file_path: string;
  language: string;
  start_line: number;
  end_line: number;
  raw_code: string;
  symbol_name?: string;
  symbol_kind?: string;
  dense_score: number;
  sparse_score: number;
  rrf_score: number;
  final_score: number;
}

export interface SearchResponse {
  query: string;
  total_results: number;
  results: SearchResultItem[];
}

export interface VerifiedCitation {
  marker: string;
  file_path: string;
  start_line: number;
  end_line: number;
  status: string;
}

export interface ChatMessage {
  id?: string;
  role: "user" | "assistant";
  content: string;
  verified_citations?: VerifiedCitation[];
  is_abstained?: boolean;
  latency_ms?: number;
}

export interface EvaluationSample {
  query_id: string;
  query: string;
  recall_at_k: number;
  reciprocal_rank: number;
  citation_precision: number;
  citation_recall: number;
  citation_f1: number;
  faithfulness: number;
  generated_answer: string;
  ground_truth_spans: { file_path: string; start_line: number; end_line: number }[];
  emitted_citations: { file_path: string; start_line: number; end_line: number }[];
}

export interface EvaluationReport {
  id: string;
  repository_id: string;
  benchmark_name: string;
  commit_sha: string;
  mean_recall_at_k: number;
  mean_mrr: number;
  mean_citation_precision: number;
  mean_citation_recall: number;
  mean_citation_f1: number;
  mean_faithfulness: number;
  created_at: string;
  sample_results: EvaluationSample[];
}

export interface DependencyGraph {
  nodes: { id: string; label: string; kind: string; in_degree: number; out_degree: number }[];
  edges: { source: string; target: string }[];
  external_packages: string[];
  internal_files_count: number;
  circular_dependencies: string[][];
}

// High-speed in-memory caches and in-flight promise deduplication
const treeCache = new Map<string, TreeNode>();
const fileContentCache = new Map<string, FileDetail>();
const searchCache = new Map<string, SearchResponse>();
const dependencyCache = new Map<string, DependencyGraph>();
const inFlightRequests = new Map<string, Promise<any>>();

function deduplicate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  const existing = inFlightRequests.get(key);
  if (existing) return existing as Promise<T>;

  const promise = fetcher().finally(() => {
    inFlightRequests.delete(key);
  });
  inFlightRequests.set(key, promise);
  return promise;
}

export const api = {
  clearRepoCache(repoId?: string) {
    if (!repoId) {
      treeCache.clear();
      fileContentCache.clear();
      searchCache.clear();
      dependencyCache.clear();
      inFlightRequests.clear();
      return;
    }
    treeCache.delete(repoId);
    dependencyCache.delete(repoId);
    inFlightRequests.delete(`repo:${repoId}`);
    inFlightRequests.delete(`tree:${repoId}`);
    inFlightRequests.delete(`dep:${repoId}`);
    for (const key of Array.from(fileContentCache.keys())) {
      if (key.startsWith(`${repoId}:`)) fileContentCache.delete(key);
    }
    for (const key of Array.from(searchCache.keys())) {
      if (key.startsWith(`${repoId}:`)) searchCache.delete(key);
    }
    for (const key of Array.from(inFlightRequests.keys())) {
      if (key.startsWith(`${repoId}:`)) inFlightRequests.delete(key);
    }
  },

  async listRepositories(): Promise<Repository[]> {
    return deduplicate("repos:list", async () => {
      const res = await fetch(`${API_BASE}/repositories`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch repositories");
      return res.json();
    });
  },

  async importRepository(url: string): Promise<Repository> {
    const res = await fetch(`${API_BASE}/repositories/import`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repository_url: url }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: "Import failed" }));
      throw new Error(err.detail || "Import failed");
    }
    const data: Repository = await res.json();
    api.clearRepoCache(data.id);
    return data;
  },

  async getRepository(id: string): Promise<Repository> {
    return deduplicate(`repo:${id}`, async () => {
      const res = await fetch(`${API_BASE}/repositories/${id}`, { cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch repository");
      return res.json();
    });
  },

  async deleteRepository(id: string): Promise<void> {
    const res = await fetch(`${API_BASE}/repositories/${id}`, {
      method: "DELETE",
    });
    if (!res.ok) {
      const err = await res
        .json()
        .catch(() => ({ detail: "Failed to delete repository" }));
      throw new Error(err.detail || "Failed to delete repository");
    }
    api.clearRepoCache(id);
    inFlightRequests.delete("repos:list");
  },

  async getRepositoryTree(id: string): Promise<TreeNode> {
    const cached = treeCache.get(id);
    if (cached) return cached;

    return deduplicate(`tree:${id}`, async () => {
      const res = await fetch(`${API_BASE}/repositories/${id}/tree`);
      if (!res.ok) throw new Error("Failed to fetch repository tree");
      const data: TreeNode = await res.json();
      if (data.children && data.children.length > 0) {
        treeCache.set(id, data);
      }
      return data;
    });
  },

  async getFileContent(repoId: string, fileId: string): Promise<FileDetail> {
    const cacheKey = `${repoId}:${fileId}`;
    const cached = fileContentCache.get(cacheKey);
    if (cached) return cached;

    return deduplicate(`file:${cacheKey}`, async () => {
      const res = await fetch(`${API_BASE}/repositories/${repoId}/files/${fileId}`);
      if (!res.ok) throw new Error("Failed to fetch file content");
      const data: FileDetail = await res.json();
      if (fileContentCache.size > 150) {
        const oldestKey = fileContentCache.keys().next().value;
        if (oldestKey) fileContentCache.delete(oldestKey);
      }
      fileContentCache.set(cacheKey, data);
      return data;
    });
  },

  async searchRepository(repoId: string, query: string, limit = 10): Promise<SearchResponse> {
    const normQuery = query.trim();
    const cacheKey = `${repoId}:${normQuery.toLowerCase()}:${limit}`;
    const cached = searchCache.get(cacheKey);
    if (cached) return cached;

    return deduplicate(`search:${cacheKey}`, async () => {
      const res = await fetch(`${API_BASE}/repositories/${repoId}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: normQuery, limit }),
      });
      if (!res.ok) throw new Error("Search failed");
      const data: SearchResponse = await res.json();
      if (searchCache.size > 100) {
        const oldestKey = searchCache.keys().next().value;
        if (oldestKey) searchCache.delete(oldestKey);
      }
      searchCache.set(cacheKey, data);
      return data;
    });
  },

  async getDependencies(repoId: string, forceRefresh = false): Promise<DependencyGraph> {
    if (!forceRefresh) {
      const cached = dependencyCache.get(repoId);
      if (cached) return cached;
    }

    return deduplicate(`dep:${repoId}:${forceRefresh}`, async () => {
      const url = forceRefresh
        ? `${API_BASE}/repositories/${repoId}/dependencies?refresh=true`
        : `${API_BASE}/repositories/${repoId}/dependencies`;
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch dependencies");
      const data: DependencyGraph = await res.json();
      dependencyCache.set(repoId, data);
      return data;
    });
  },

  async runEvaluation(repoId: string): Promise<EvaluationReport> {
    const res = await fetch(`${API_BASE}/repositories/${repoId}/evaluate`, {
      method: "POST",
    });
    if (!res.ok) throw new Error("Failed to run evaluation");
    return res.json();
  },

  async listEvaluations(repoId: string): Promise<EvaluationReport[]> {
    const res = await fetch(`${API_BASE}/repositories/${repoId}/evaluations`, {
      cache: "no-store",
    });
    if (!res.ok) throw new Error("Failed to list evaluations");
    return res.json();
  },
};
