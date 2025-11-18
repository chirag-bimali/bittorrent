import { exit } from "process";
import dgram from "dgram";
import BencodeEncoder from "./bencodeEncoder";
import BencodeDecoder from "./bencodeDecoder";
import crypto from "crypto";
import type { Dictionary } from "./types";

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
    return id >= this.min && id < this.max;
    // return this.min <= id && this.max > id;
  }
  static findSpaceIndex(buckets: Bucket[], nodeid: Buffer): number {
    return buckets.findIndex((bucket) => bucket.fits(nodeid));
  }

  split(): [Bucket, Bucket] {
    if (this.hasSpace()) throw new Error(`bucket is not full`);

    const mid = (this.min + this.max) >> 1n;
    const newBuckets = [
      new Bucket(this.min, mid),
      new Bucket(mid + 1n, this.max),
    ];

    this.nodes.forEach((node) => {
      const index = Bucket.findSpaceIndex(newBuckets, node.id);
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
  static bigintToBuffer(bi: bigint): Buffer {
    let hex = bi.toString(16);
    if (hex.length % 2 != 0) hex = "0" + hex;
    return Buffer.from(hex, "hex");
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
    let index = Bucket.findSpaceIndex(this.buckets, node.id);
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
      index = Bucket.findSpaceIndex(this.buckets, node.id);
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
  // !TEST REQUIRED
  findNearest(
    nodeId: Buffer,
    quantity: number,
    // r/l stands for right/left respectively
    options: { r: boolean; l: boolean } = {
      r: true,
      l: true,
    }
  ): NodeInfo[] {
    const index = Bucket.findSpaceIndex(this.buckets, nodeId);

    let min = this.buckets[index].min;
    let max = this.buckets[index].max;
    const nodes: NodeInfo[] = [];

    let left = index === -1 ? null : Bucket.bigintToBuffer(min - 1n);
    let right = index === -1 ? null : Bucket.bigintToBuffer(max + 1n);

    const bucket = this.buckets[index];
    const distanceRecord: { node: NodeInfo; distance: bigint }[] = [];
    for (const node of bucket.nodes) {
      distanceRecord.push({
        node: node,
        distance:
          Bucket.bufferToBigint(nodeId) ^ Bucket.bufferToBigint(node.id),
      });
    }
    distanceRecord.sort((a, b) => {
      if (a.distance - b.distance === 0n) return 0;
      return a.distance - b.distance > 0 ? 1 : -1;
    });
    for (const dr of distanceRecord) {
      nodes.push(dr.node);
      if (nodes.length === quantity) break;
    }
    if (nodes.length === quantity) return nodes;

    if (index >= 0 && left && options.l) {
      nodes.push(
        ...this.findNearest(left, quantity - nodes.length, {
          l: true,
          r: false,
        })
      );
    }
    if (index <= this.buckets.length && right && options.r) {
      nodes.push(
        ...this.findNearest(right, quantity - nodes.length, {
          l: false,
          r: true,
        })
      );
    }

    return nodes;
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
  public RRTracker: Map<
    string,
    (err: Error | null, request: any, rinfo: dgram.RemoteInfo) => void
  > = new Map<string, (request: any, rinfo: dgram.RemoteInfo) => void>();

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
   * "v": "versioning stuff" // not necessary for now
   */
  /*
   * Initialize DHT by calling to Bootstrap node
   * Join the network first
   */
  initialie() {
    // Respond to incoming responses
    this.client.on("message", (msg: Buffer, rinfo) => {
      console.log("Data received");
      const decoded = BencodeDecoder.decodeBencode(
        msg.toString("binary")
      ) as Dictionary;
      if (decoded.t) {
        const callBackfn = this.RRTracker.get(decoded.t);
        if (callBackfn) callBackfn(null, decoded, rinfo);
      }
    });
    // Listen on port
    this.client.on("listening", () => {
      console.log(`Listening on ${this.HOST}:${this.PORT}`);
      this.bootstrapNode.forEach((value) => {
        this.ping(value.ip, value.port, (err, request, rinfo) => {
          const r = request as {
            ip?: string;
            r: { id: string };
            t: string;
            y: string;
          };
          const node: NodeInfo = {
            id: Buffer.from(r.r.id, "binary"),
            ip: rinfo.address,
            port: rinfo.port,
          };
          this.routingTable.insert(node);
          console.log(`${rinfo.address} inserted into the bucket`);
          // Find new peers
          // Try finding nearest node
          console.log(request);
          const id = Bucket.bufferToBigint(this.ID) + 10000000n;
          this.findNode(
            Bucket.bigintToBuffer(id),
            node,
            (err: Error | null, request: any, rinfo: dgram.RemoteInfo) => {
              console.log(request);
            }
          );
        });
      });
    });
    // Handle errors
    this.client.on("error", (err) => {
      console.error("DHT socket error:", err);
    });
    // Bind application to the port
    this.client.bind(this.PORT, this.HOST);
  }
  setBootstrap(ip: string, port: number) {
    this.bootstrapNode.push({ ip, port });
  }

  /*
   * Ping the node
   */
  ping(
    ip: string,
    port: number,
    callbackFn: (
      err: Error | null,
      request: any,
      rinfo: dgram.RemoteInfo
    ) => void
  ) {
    const txnId = crypto
      .createHash("sha1")
      .update(Math.random().toString(), "utf-8")
      .digest()
      .subarray(0, 2)
      .toString("binary");

    const msg = {
      t: txnId,
      y: "q",
      q: "ping",
      a: { id: this.ID.toString("binary") },
    };
    const encoded = BencodeEncoder.bencodeDictonary(msg);
    const encodedBuf = Buffer.from(String(encoded), "binary");

    this.client.send(encodedBuf, port, ip, (err) => {
      if (err) {
        console.log(`Connection failed to ${ip}:${port}`);
      } else {
        this.RRTracker.set(txnId, callbackFn);
      }
    });
  }

  /*
   * Find query to the node
   */
  findNode(
    target: Buffer,
    node: NodeInfo,
    callbackFn: (
      err: Error | null,
      request: any,
      rinfo: dgram.RemoteInfo
    ) => void
  ) {
    const txnId = crypto
      .createHash("sha1")
      .update(Math.random().toString(), "utf-8")
      .digest()
      .subarray(0, 2)
      .toString("binary");

    const msg = {
      t: txnId,
      y: "q",
      q: "find_node",
      a: { id: this.ID.toString("binary"), target: target.toString("binary") },
    };
    const encoded = BencodeEncoder.bencodeDictonary(msg);
    const encodedBuf = Buffer.from(String(encoded), "binary");

    this.client.send(encodedBuf, node.port, node.ip, (err) => {
      if (err) {
        console.log(`Connection failed to ${node.ip}:${node.port}`);
      } else {
        this.RRTracker.set(txnId, callbackFn);
      }
    });
  }

  /*
   * Get peers query to the node
   */
  getPeers(
    infoHash: Buffer,
    node: NodeInfo,
    callBackFn: (
      err: Error | null,
      request: any,
      rinfo: dgram.RemoteInfo
    ) => void
  ) {
    const txnId = crypto
      .createHash("sha1")
      .update(Math.random().toString(), "utf-8")
      .digest()
      .subarray(0, 2)
      .toString("binary");

    const msg = {
      t: txnId,
      y: "q",
      q: "get_peers",
      a: {
        id: this.ID.toString("binary"),
        info_hash: infoHash.toString("binary"),
      },
    };
    const encoded = BencodeEncoder.bencodeDictonary(msg);
    const encodedBuf = Buffer.from(String(encoded), "binary");

    this.client.send(encodedBuf, node.port, node.ip, (err) => {
      if (err) {
        console.log(`Connection failed to ${node.ip}:${node.port}`);
      } else {
        this.RRTracker.set(txnId, callBackFn);
      }
    });
  }

  /*
   * Announce peers query to the node
   */
  announcePeer() {}
}
