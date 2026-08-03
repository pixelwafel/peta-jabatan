export type EdgeKind = 'hirarki' | 'koordinasi' | 'pembinaan';

export interface OrgEdge {
  id: string;
  source: string; // parent node id
  target: string; // child node id
  kind: EdgeKind;
}
