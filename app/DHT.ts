import { exit } from "process";

interface NodeInfo {
  id: Buffer;
  ip: string;
  port: number;
}
// bucket operation
// insert node ✓
// read node ✓
// update node 
// delete node 
// check bucket compatibility
// has space operation

export class Bucket {
  public nodes: NodeInfo[] = [];
  public max: bigint;
  public min: bigint;
  public size: number;
  constructor(min: bigint, max: bigint, size: number = 8) {
    if (max <= min) throw new Error(`max: ${max} <= min : ${min}`);
    this.max = max;
    this.min = min;
    if (size <= 0) throw new Error(`size must be <= 1, size: ${size}`);
    this.size = size;
  }
  hasSpace(): boolean {
    return this.nodes.length < this.size;
  }
  fits(nodeId: Buffer): boolean {
    const id = Bucket.bufferToBigint(nodeId);
    return this.min <= id && this.max > id;
  }
  static findSpaceIndex(buckets: Bucket[], node: NodeInfo): number {
    return buckets.findIndex((bucket) => bucket.fits(node.id));
  }

  split(): [Bucket, Bucket] {
    if (this.hasSpace()) throw new Error(`bucket is not full`);

    const mid = (this.min + this.max) >> 1n;
    const newBuckets = [
      new Bucket(this.min, mid),
      new Bucket(mid + 1n, this.max),
    ];

    this.nodes.forEach((node) => {
      const index = Bucket.findSpaceIndex(newBuckets, node);
      newBuckets[index].insert(node);
    });

    return [newBuckets[0], newBuckets[1]];
  }
  find(callBackfn: (node: NodeInfo) => boolean): NodeInfo | null {
    const node = this.nodes.find(callBackfn)
    return node ? node : null;
  }
  static bufferToBigint(buffer: Buffer): bigint {
    return BigInt("0x" + buffer.toString("hex"));
  }
  insert(node: NodeInfo) {
    if (!this.hasSpace()) throw new Error(`bucket has no space`);

    const id = Bucket.bufferToBigint(node.id);

    if (this.fits(node.id)) {
      this.nodes.push(node);
    } else throw new Error(`invalid range for node id`);
  }
}
export class RoutingTable {
  public min: bigint;
  public max: bigint;
  public buckets: Bucket[] = [];
  public clientId: Buffer;
  constructor(min: bigint, max: bigint, clientId: Buffer) {
    this.min = min;
    this.max = max;
    this.clientId = clientId;
    this.buckets.push(new Bucket(min, max));
  }
  insert(node: NodeInfo) {
    let index = Bucket.findSpaceIndex(this.buckets, node);
    if (
      this.buckets[index].find((n): boolean => {
        return n.id.equals(node.id);
      })
    ) {
      throw new Error("no duplicates allowed");
    }
    if (index < 0)
      throw new Error(
        `could not find space for the node ${node.id.toString("hex")}`
      );
    while (!this.buckets[index].hasSpace()) {
      const newBuckets = this.buckets[index].split();
      // splice mutates
      this.buckets.splice(index, 1);
      this.buckets.push(...newBuckets);
      index = Bucket.findSpaceIndex(this.buckets, node);
      if (this.buckets[index].hasSpace()) {
        break;
      } else continue;
    }
    if (index < 0)
      throw new Error(
        `could not find space for the node ${node.id.toString("hex")}`
      );
    this.buckets[index].insert(node);
  }
  find(callbackFn:(node: NodeInfo) => boolean): NodeInfo | null {
    for(const bucket of this.buckets) {
      const node = bucket.find(callbackFn)
      if(node) return node
    }
    return null;
  }
}
export default class DHT {
  public routingTable: RoutingTable;
  public maxIdSpace: bigint;
  constructor(maxIdSpace: bigint, clientId: Buffer) {
    this.routingTable = new RoutingTable(0n, maxIdSpace, clientId);
    this.maxIdSpace = maxIdSpace;
  }
}
