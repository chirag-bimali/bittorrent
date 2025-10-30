interface NodeInfo {
  id: Buffer;
  ip: string;
  port: number;
}
export class Bucket {
  public nodes: NodeInfo[] = [];
  public max: bigint;
  public min: bigint;
  public size: number;
  constructor(min: bigint, max: bigint, size: number = 8) {
    if (max <= min) throw new Error(`max: ${max} <= min : ${min}`);
    this.max = max;
    this.min = max;
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
  split(min: bigint, max: bigint, clientId: Buffer): [Bucket, Bucket] {
    if (!this.hasSpace()) throw new Error(`bucket is not full`);
    if (!this.fits(clientId))
      throw new Error(`bucket not within node id range`);

    const mid = (this.min + this.max) >> 1n;
    const bucketA = new Bucket(this.min, mid);
    const bucketB = new Bucket(mid + 1n, this.max);

    this.nodes.forEach((node) => {
      if (bucketA.fits(node.id)) bucketA.insert(node);
      else bucketB.insert(node);
    });

    return [bucketA, bucketB];
  }
  static bufferToBigint(buffer: Buffer): bigint {
    return BigInt("0x" + buffer.toString("hex"));
  }
  insert(node: NodeInfo) {
    if (!this.hasSpace()) throw new Error(`bucket has no space`);
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
    if (index < 0)
      throw new Error(
        `could not find space for the node ${node.id.toString("hex")}`
      );
    if (!this.buckets[index].hasSpace()) {
      const newBuckets = this.buckets[index].split(
        this.buckets[index].min,
        this.buckets[index].max,
        this.clientId
      );
      this.buckets.slice(index, 1);
      this.buckets.push(...newBuckets);
      index = Bucket.findSpaceIndex(this.buckets, node);
    }
    if (index < 0)
      throw new Error(
        `could not find space for the node ${node.id.toString("hex")}`
      );
    this.buckets[index].insert(node);
  }
}
export default class DHT {
  public routingTable: RoutingTable;
  public maxIdSpace: bigint = 2n ^ 159n;
  constructor(maxIdSpace: bigint, clientId: Buffer) {
    this.routingTable = new RoutingTable(
      0n,
      maxIdSpace,
      clientId
    );
  }
}
