export interface DsTreeNode { id:string; label:string; disabled?:boolean; children?:DsTreeNode[] }
export function flattenTree(nodes:DsTreeNode[],depth=0):{node:DsTreeNode;depth:number}[]{return nodes.flatMap(node=>[{node,depth},...flattenTree(node.children || [],depth+1)])}
