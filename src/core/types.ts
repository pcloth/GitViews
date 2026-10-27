export interface Commit {
  hash: string;
  parents: string[];
  author: string;
  email: string;
  authorDate: string;
  commitDate: string;
  message: string;
  subject: string;
}

export interface GitRef { name: string; hash: string; }
export interface HistoryQuery { ref?: string; search?: string; author?: string; skip: number; limit: number; }
export interface FileChange {
  status: string;
  oldPath: string;
  path: string;
  binary: boolean;
  additions: number;
  deletions: number;
}
export interface CommitDetails { commit: Commit; parent?: string; files: FileChange[]; }
export interface BlameLine {
  hash: string;
  originalLine: number;
  finalLine: number;
  author: string;
  email: string;
  date: string;
  subject: string;
  filename: string;
  uncommitted: boolean;
}
export interface GraphEdge { from: number; to: number; color: number; }
export interface GraphRow {
  hash: string;
  column: number;
  width: number;
  incoming: number[];
  edges: GraphEdge[];
}
