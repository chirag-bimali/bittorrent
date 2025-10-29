interface NodeInfo {
  id: Buffer;
  ip: string;
  port: number;
}
export class Bucket {
  public nodes: NodeInfo[] = [];
  public max: number;
  public min: number;
  public size: number;
  constructor(min: number, max: number, size: number = 8) {
    if (max <= min) throw new Error(`max: ${max} <= min : ${min}`);
    this.max = max;
    this.min = max;
    if (size <= 0) throw new Error(`k must be <= 1, k: ${k}`);
    this.size = size;
  }
  split(): [Bucket, Bucket] {
    return [
      new Bucket(this.min, this.max / 2),
      new Bucket(this.max / 2, this.max),
    ];
  }
  insert(node: NodeInfo) {
    if (this.nodes.length >= this.size) throw new Error(`Bucket is full`);
    this.nodes.push(node);
    this.nodes = this.nodes.sort((nodeA, nodeB) => Buffer.compare(nodeA.id, nodeB.id));
  }
}
export class RoutingTable {
  public range: number;
  public bucket: Bucket[] = [];
  constructor(range: number) {
    this.range = range;
  }
}
export default class DHT {}
