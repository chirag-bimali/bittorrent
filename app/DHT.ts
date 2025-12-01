import dgram, { Socket, type RemoteInfo } from "dgram";
import BencodeEncoder from "./bencodeEncoder";
import BencodeDecoder from "./bencodeDecoder";
import crypto from "crypto";
import type { Dictionary } from "./types";
import fs from "fs";

export interface NodeInfo {
  id: Buffer;
  ip: string;
  port: number;
  lastseen?: Date;
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
  public changedAt: Date;
  constructor(min: bigint, max: bigint, size: number = 8) {
    if (max <= min) throw new Error(`max: ${max} <= min : ${min}`);
    this.max = max;
    this.min = min;
    if (size <= 0) throw new Error(`size must be <= 1, size: ${size}`);
    this.size = size;
    this.changedAt = new Date();
  }
  public hasSpace(): boolean {
    return this.nodes.length < this.size;
  }
  public fits(nodeId: Buffer): boolean {
    const id = Bucket.bufferToBigint(nodeId);
    return id >= this.min && id < this.max;
    // return this.min <= id && this.max > id;
  }

  public split(): [Bucket, Bucket] {
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
  public find(callBackfn: (node: NodeInfo) => boolean): NodeInfo | null {
    const node = this.nodes.find(callBackfn);
    return node ? node : null;
  }
  public delete(callBackfn: (node: NodeInfo) => boolean): NodeInfo[] | null {
    const index = this.nodes.findIndex(callBackfn);
    if (index < 0) return null;
    return this.nodes.splice(index, 1);
  }
  public insert(node: NodeInfo) {
    if (!this.hasSpace()) throw new Error(`bucket has no space`);

    const id = Bucket.bufferToBigint(node.id);

    if (this.fits(node.id)) {
      this.nodes.push(node);
    } else throw new Error(`invalid range for node id`);
  }

  static bufferToBigint(buffer: Buffer): bigint {
    return BigInt("0x" + buffer.toString("hex"));
  }
  static bigintToBuffer(bi: bigint): Buffer {
    let hex = bi.toString(16);
    if (hex.length % 2 != 0) hex = "0" + hex;
    return Buffer.from(hex, "hex");
  }
  static findSpaceIndex(buckets: Bucket[], nodeid: Buffer): number {
    return buckets.findIndex((bucket) => bucket.fits(nodeid));
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

    if (index < 0)
      throw new Error(
        `could not find space for the node ${Bucket.bufferToBigint(node.id)}`
      );
    if (
      this.buckets[index].find((n): boolean => {
        return n.id.equals(node.id);
      })
    ) {
      throw new Error("no duplicates allowed");
    }
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

    if (index === -1) return [];

    let min = this.buckets[index].min;
    let max = this.buckets[index].max;
    const nodes: NodeInfo[] = [];

    let left: Buffer | null =
      index === -1 || index - 1 <= 0 || min - 1n < this.min
        ? null
        : Bucket.bigintToBuffer(min - 1n);

    let right: Buffer | null =
      index === -1 || index + 1 >= this.buckets.length || max + 1n > this.max
        ? null
        : Bucket.bigintToBuffer(max + 1n);

    const bucket = this.buckets[index];
    let distanceRecord: { node: NodeInfo; distance: bigint }[] = [];
    for (const node of bucket.nodes) {
      distanceRecord.push({
        node: node,
        distance:
          Bucket.bufferToBigint(nodeId) ^ Bucket.bufferToBigint(node.id),
      });
    }

    distanceRecord = distanceRecord.sort((a, b) => {
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
  size(): number {
    let i = 0;
    for (const bucket of this.buckets) {
      i += bucket.nodes.length;
    }
    return i;
  }
  delete(callBackfn: (node: NodeInfo) => boolean): NodeInfo[] | null {
    for (const bucket of this.buckets) {
      const node = bucket.delete(callBackfn);
      if (node !== null) return node;
    }
    return null;
  }
  save(path: string) {
    const nodes: NodeInfo[] = [];
    this.buckets.forEach((value) => {
      nodes.push(...value.nodes);
    });
    const encoded = BencodeEncoder.bencodeList(nodes);
    const fd = fs.openSync(path, "w+");
    fs.writeFileSync(fd, encoded, { encoding: "binary" });
    fs.closeSync(fd);
  }
  load(path: string): number {
    const fd = fs.openSync(path, "r+");
    const encoded = fs.readFileSync(fd, { encoding: "binary" });
    if (encoded.length === 0) return 0;
    const [datas, total] = BencodeDecoder.decodeBencodeList(encoded);
    const nodes: NodeInfo[] = datas.map(
      (value: { id: string; ip: string; port: number }) => {
        const node: NodeInfo = {
          id: Buffer.from(value.id, "binary"),
          ip: value.ip,
          port: value.port,
        };
        return node;
      }
    );
    nodes.forEach((node) => {
      this.insert(node);
    });
    console.log(nodes);
    return nodes.length;
  }
}
export default class DHT {
  public routingTable: RoutingTable;
  public maxIdSpace: bigint;
  public infoHashNode: Map<Buffer, NodeInfo[]> = new Map<Buffer, NodeInfo[]>();
  public BOOTSTRAP_NODE_LOADED: boolean = false;
  public PORT: number = 6882;
  public HOST: string = "0.0.0.0";
  private bootstrapNode: { ip: string; port: number }[] = [];
  public ID: Buffer;
  private client = dgram.createSocket("udp4");
  public RRTracker: Map<
    string,
    (err: Error | null, request?: any, rinfo?: dgram.RemoteInfo) => void
  > = new Map<
    string,
    (err: Error | null, request?: any, rinfo?: dgram.RemoteInfo) => void
  >();

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
    try {
      // Respond to incoming responses
      this.client.on("message", (msg: Buffer, rinfo) => {
        try {
          console.log("Data received");
          const decoded = BencodeDecoder.decodeBencode(
            msg.toString("binary")
          ) as Dictionary;
          if (decoded.t) {
            const callBackfn = this.RRTracker.get(decoded.t);
            if (callBackfn) callBackfn(null, decoded, rinfo);
          }
        } catch (err) {
          if (err instanceof Error) throw err;
        }
      });
      // Handle errors
      this.client.on("error", (err) => {
        console.error("DHT socket error:", err);
      });
      // Bind application to the port
      this.client.bind(this.PORT);
      // this.client.bind(this.PORT, this.HOST);
    } catch (err) {
      if (err instanceof Error) throw err;
    }
  }
  fill(
    nearestNodes: NodeInfo[],
    referenceId: Buffer,
    callbackfn: (
      err: Error | null,
      request?: NodeInfo[],
      rinfo?: RemoteInfo
    ) => void
  ) {
    for (const nearestNode of nearestNodes) {
      this.findNode(referenceId, nearestNode, callbackfn);
    }
  }

  listen(callbackfn: (err: Error | null) => void) {
    this.client.on("listening", () => {
      callbackfn(null);
    });
  }
  pingBootstrap(
    callbackfn: (
      err: Error | null,
      request?: {
        ip?: string;
        r: { id: Buffer };
        t: string;
        y: string;
      },
      rinfo?: RemoteInfo
    ) => void
  ) {
    try {
      this.bootstrapNode.forEach((value) => {
        this.ping(value.ip, value.port, callbackfn);
      });
    } catch (err) {
      if (err instanceof Error) throw err;
    }
  }
  setBootstrap(ip: string, port: number) {
    this.bootstrapNode.push({ ip, port });
  }

  /*
   * Ping the node
   */
  async ping(
    ip: string,
    port: number,
    callbackfn: (
      err: Error | null,
      request?: {
        ip?: string;
        r: { id: Buffer };
        t: string;
        y: string;
      },
      rinfo?: dgram.RemoteInfo
    ) => void
  ) {
    try {
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
        try {
          if (err) {
            console.log(`Connection failed to ${ip}:${port}`);
            callbackfn(new Error(`Connection failed to ${ip}:${port}`));
          } else {
            this.RRTracker.set(
              txnId,
              (err, request?: any, rinfo?: RemoteInfo) => {
                const response: {
                  ip?: string;
                  r: { id: Buffer };
                  t: string;
                  y: string;
                } = {
                  ip: request.ip,
                  r: { id: Buffer.from(request?.r?.id, "binary") },
                  t: request.t,
                  y: request.t,
                };

                callbackfn(null, response, rinfo);
              }
            );
          }
        } catch (err) {
          if (err instanceof Error) throw err;
        }
      });
    } catch (err: unknown) {
      if (err instanceof Error) throw err;
    }
  }

  /*
   * Find query to the node
   */
  findNode(
    target: Buffer,
    node: NodeInfo,
    callbackfn: (
      err: Error | null,
      request?: NodeInfo[],
      rinfo?: dgram.RemoteInfo
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
        callbackfn(err);
      } else {
        this.RRTracker.set(txnId, (err, request?: any, rinfo?: RemoteInfo) => {
          if (err) {
            callbackfn(err);
            return;
          }

          const r = request as {
            t: Buffer;
            y: string;
            r: { id: Buffer; nodes: string };
          };

          // Check if buffer can be parsed
          let nodeInfosBuffer: Buffer[] = [];
          if (r.r.nodes.length % 26 !== 0) {
            callbackfn(new Error(`Unable to parse compact node info`));
            return;
          }

          // Split the response into individual unit
          const total = r.r.nodes.length / 26;
          const temp = Buffer.from(r.r.nodes, "binary");
          for (let i = 0; i < total; i++) {
            nodeInfosBuffer.push(temp.subarray(i * 26, (i + 1) * 26));
            // console.log(nodeInfosBuffer[i]);
          }

          // Structure the response
          const nodes: NodeInfo[] = [];
          nodeInfosBuffer.forEach((buffer) => {
            const id = buffer.subarray(0, 20);
            const ip = buffer.subarray(20, 24);
            const ipStr = `${ip[0]}.${ip[1]}.${ip[2]}.${ip[3]}`;
            const port = buffer.subarray(24, 26);

            const node: NodeInfo = {
              id: id,
              ip: ipStr,
              port: port.readUInt16LE(0),
            };

            nodes.push(node);
          });
          callbackfn(null, nodes, rinfo);
        });
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
      request?: any,
      rinfo?: dgram.RemoteInfo
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
  /*
  arguments:  {"id" : "<querying nodes id>",
  "implied_port": <0 or 1>,
  "info_hash" : "<20-byte infohash of target torrent>",
  "port" : <port number>,
  "token" : "<opaque token>"}
  */
  announcePeer(
    infoHash: Buffer,
    implied_port: 0 | 1,
    port: number,
    token: Buffer,
    node: NodeInfo,
    callbackfn: (err: Error | null, response?: any, rinfo?: RemoteInfo) => void
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
      q: "announce_peer",
      a: {
        implied_port: implied_port,
        port: port,
        token: token.toString("binary"),
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
        this.RRTracker.set(txnId, callbackfn);
      }
    });
  }

  pingBootstrapDefaultHandler = (
    err: Error | null,
    request?: {
      ip?: string;
      r: { id: Buffer };
      t: string;
      y: string;
    },
    rinfo?: RemoteInfo
  ) => {
    if (err) {
      console.error(err.message);
      return;
    }
    if (!request || !rinfo) return;
    const node: NodeInfo = {
      id: request.r.id,
      ip: rinfo.address,
      port: rinfo.port,
    };
    if (
      this.routingTable.find((n) => {
        return n.id.equals(node.id);
      })
    ) {
      console.log(`contact ${node.id} already saved ✔️`);
      this.BOOTSTRAP_NODE_LOADED = true;
      this.routingTable.save("./rt");
      return;
    }
    this.routingTable.insert(node);
    this.routingTable.save("./rt");
    this.BOOTSTRAP_NODE_LOADED = true;
    console.log(`contact ${node.id} saved ✔️`);
  };

  start() {
    this.listen((err) => {
      try {
        if (err) {
          console.error(err);
        }
        console.log(`Listening on ${this.HOST}:${this.PORT}`);
        this.pingBootstrap(this.pingBootstrapDefaultHandler);
      } catch (err: unknown) {
        if (err instanceof Error) console.error(err);
      }
    });

    const calledNodes: NodeInfo[] = [];
    const fillHandler = (
      err: Error | null,
      nodes?: NodeInfo[],
      rinfo?: RemoteInfo
    ) => {
      if (err) {
        console.error(err);
        return;
      }
      if (!(nodes && rinfo)) return;

      // Save the response
      nodes.forEach((node) => {
        const f = this.routingTable.find((n) => {
          return node.id.equals(n.id);
        });
        if (f === null) {
          this.routingTable.insert(node);
        }
      });

      // Repeat: find nearest
      let newNearestNode = this.routingTable.findNearest(this.ID, 40);

      // Filter already queried node
      newNearestNode = newNearestNode.filter((nNNode: NodeInfo) => {
        const found = calledNodes.find((cNode: NodeInfo) => {
          return nNNode.id.equals(cNode.id);
        });
        if (found) return true;
        else false;
      });
      calledNodes.push(...newNearestNode);

      // If new nodes then query
      if (newNearestNode.length !== 0) {
        this.fill(newNearestNode, this.ID, fillHandler);
        return;
      }

      // Save table after completion
      this.routingTable.save("./rt");

      console.log(`saved!`);
      console.log(`total nodes: ${this.routingTable.size()}`);
    };
    const loadedNodes = this.routingTable.load("./rt");
    let nearest = this.routingTable.findNearest(this.ID, 40);
    calledNodes.push(...nearest);

    // 1. check every few seconds
    // 2. if node is bootstrapped or more than one node loaded then clear the interval
    // 3. if there are less then 100 nodes loaded from memory start filling up the table
    const loadInterval = setInterval(() => {
      if (this.BOOTSTRAP_NODE_LOADED || loadedNodes > 0)
        clearInterval(loadInterval);
      else return;
      if (loadedNodes > 100) return;
      this.fill(nearest, this.ID, fillHandler);
    }, 2000);
    const pingInterval = setInterval(() => {
      this.pingPeers();
      clearInterval(pingInterval);
    }, 5000);

    // }, 2);
  }
  pingPeers(
    callbackfn?: (
      err: Error | null,
      request?: {
        ip?: string;
        r: { id: Buffer };
        t: string;
        y: string;
      },
      rinfo?: dgram.RemoteInfo
    ) => void
  ) {
    const fifteenMin = 90000;
    const twentyMin = 120000;
    const now = Date.now();
    for (const bucket of this.routingTable.buckets) {
      for (const node of bucket.nodes) {
        console.log(`Pinged ${node.ip}`);
        if (callbackfn) {
          this.ping(node.ip, node.port, callbackfn);
          return;
        }
        // 90,000 === 15 mins
        if (
          !node.lastseen ||
          (now - node.lastseen.getTime() > fifteenMin &&
            now - node.lastseen.getTime() < twentyMin)
        ) {
          this.ping(node.ip, node.port, (err, request?, rinfo?) => {
            if (err) {
              console.error(err);
            }
            if (!request || !rinfo) return;
            if (node.id.equals(request.r.id)) node.lastseen = new Date();
            this.routingTable.save("./rt");
          });
          return;
        }
        if (now - node.lastseen.getTime() > twentyMin) {
          // ping again last
          // create a settimeout
          // start replacing this node
          // search it in node buffer
          // ping surrounding node with random id in that bucket range
        }
      }
    }
  }
  discoverNewId(
    bucket: Bucket,
    bufferNode: NodeInfo[],
    callbackfn?: (
      err: Error | null,
      request?: NodeInfo[],
      rinfo?: dgram.RemoteInfo
    ) => void
  ) {
    const random = bucket.min + (bucket.max - bucket.min) / 2n;
    bucket.nodes.forEach((node) => {
      if (callbackfn) {
        this.findNode(Bucket.bigintToBuffer(random), node, callbackfn);
        return;
      }
      this.findNode(
        Bucket.bigintToBuffer(random),
        node,
        (err: Error | null, request?: NodeInfo[], rinfo?: dgram.RemoteInfo) => {
          if (err) {
            console.error(err);
            return;
          }
          for (const item of request ? request : ([] as NodeInfo[])) {
            const node = bufferNode.find((node) => node.id.equals(item.id));
            if (!node) continue;
            bufferNode.push(node);
          }
        }
      );
    });
  }
}
