export type NodeKind = "file" | "folder";

export interface ProjectNode {
  name: string;
  path: string;
  kind: NodeKind;
  language: string | null;
  children: ProjectNode[];
}

export interface ProjectInfo {
  name: string;
  path: string;
  created: boolean;
  tree: ProjectNode;
}

export interface ProjectFile {
  name: string;
  path: string;
  language: string;
  content: string;
}

export interface FileBuffer {
  name: string;
  language: string;
  content: string;
  savedContent: string;
}

export interface SearchMatch {
  name: string;
  path: string;
  line: number;
  preview: string;
}
