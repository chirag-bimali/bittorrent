import { exit } from "process";
import dgram from "dgram";
import BencodeEncoder from "./bencodeEncoder";
import BencodeDecoder from "./bencodeDecoder";
import crypto from "crypto";

export interface NodeInfo {
  id: Buffer;
  ip: string;
  port: number;
}
// bucket operation
// insert node ✓
// read node ✓
// update node
// delete node ✓
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
    const node = this.nodes.find(callBackfn);
    return node ? node : null;
  }
  delete(callBackfn: (node: NodeInfo) => boolean): NodeInfo[] | null {
    const index = this.nodes.findIndex(callBackfn);
    if (index < 0) return null;
    return this.nodes.splice(index, 1);
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
  find(callbackFn: (node: NodeInfo) => boolean): NodeInfo | null {
    for (const bucket of this.buckets) {
      const node = bucket.find(callbackFn);
      if (node) return node;
    }
    return null;
  }
  delete(callBackfn: (node: NodeInfo) => boolean): NodeInfo[] | null {
    for (const bucket of this.buckets) {
      const node = bucket.delete(callBackfn);
      if (node !== null) return node;
    }
    return null;
  }
}
export default class DHT {
  public routingTable: RoutingTable;
  public maxIdSpace: bigint;
  public infoHashNode: Map<Buffer, NodeInfo[]> = new Map<Buffer, NodeInfo[]>();
  public PORT: number = 6881;
  public HOST: string = "0.0.0.0";
  private bootstrapNode: { ip: string; port: number }[] = [];
  public ID: Buffer;
  private client = dgram.createSocket("udp4");

  constructor(maxIdSpace: bigint, clientId: Buffer) {
    this.routingTable = new RoutingTable(0n, maxIdSpace, clientId);
    this.maxIdSpace = maxIdSpace;
    this.ID = clientId;
  }
  // ping, find_node, get_peers, and announce_peer.
  /*
   * "t": "transaction-id"
   * "y": "q" | "r" | "e"
   * "y": "q" | "r" | "e"
   * "v": "versioning stuff" // not necessary
   */
  /*
   * Initialize DHT by calling to Bootstrap node
   * Join the network first
   */
  initialie() {
    this.client.on("message", (msg: Buffer, rinfo) => {
      console.log("Data received");
      console.log(msg);
      console.log(rinfo);
    });
    this.client.on("listening", () => {
      console.log(`Listening on ${this.HOST}:${this.PORT}`);
      this.bootstrapNode.forEach((value) => {
        this.ping(value.ip, value.port);
      });
    });
    this.client.on("error", (err) => {
      console.error("DHT socket error:", err);
    });
    this.client.bind(this.PORT, this.HOST);
  }
  setBootstrap(ip: string, port: number) {
    this.bootstrapNode.push({ ip, port });
  }

  /*
   * Ping the node
   */
  ping(ip: string, port: number) {
    const tId = crypto
      .createHash("sha1")
      .update(Math.random().toString(), "utf-8")
      .digest()
      .subarray(0, 2);
    const tIdString = tId.toString("binary");
    const clientIdString = this.ID.toString("binary");

    const msg = {
      t: tIdString,
      y: "q",
      q: "ping",
      a: { id: clientIdString },
    };
    const encoded = BencodeEncoder.bencodeDictonary(msg);
    const encodedBuf = Buffer.from(String(encoded), "binary");

    this.client.send(encodedBuf, port, ip, (err) => {
      console.log(`Datagram sent`);
      console.log(`Error:`);
      console.log(err);
    });
  }

  /*
   * Find query to the node
   */
  findNnode() {}

  /*
   * Get peers query to the node
   */
  getPeers() {}

  /*
   * Announce peers query to the node
   */
  announcePeer() {}
}
