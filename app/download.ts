import fs from "fs";

import type {} from "./types";
import Torrent from "./Torrent";
import DHT, { RoutingTable } from "./DHT";
import type { NodeInfo } from "./DHT";
import type { RemoteInfo } from "dgram";

const OPTION_DOWNLOAD_PATH = "-output";
const OPTION_TORRENT_PATH = "-torrent";

function argumentParser(args: string[]): {
  output: string;
  torrent: string;
} {
  const downloadOptionIndex = args.findIndex((arg) => {
    return arg === OPTION_DOWNLOAD_PATH;
  });

  if (downloadOptionIndex < 0 && !args[downloadOptionIndex + 1]) {
    throw new Error("Download path not specified");
  }

  const torrentPathOptionIndex = args.findIndex((arg) => {
    return arg === OPTION_TORRENT_PATH;
  });
  if (torrentPathOptionIndex < 0 && !args[torrentPathOptionIndex + 1]) {
    throw new Error("Torrent file path not specified");
  }
  const downloadPath = args[downloadOptionIndex + 1];
  const torrentFilePath = args[torrentPathOptionIndex + 1];
  return {
    output: downloadPath,
    torrent: torrentFilePath,
  };
}
export default function download(args: string[]) {
  const argObj = argumentParser(args);
  const torrentString = fs.readFileSync(argObj.torrent, "binary");
  const torrent = new Torrent(torrentString);
  // torrent.lsdEnable();
  const maxIdSpace: bigint = BigInt(Math.pow(2, 160));
  const dht = new DHT(maxIdSpace, torrent.clientId);
  dht.setBootstrap("router.bittorrent.com", 6881);
  dht.setBootstrap("router.utorrent.com", 6881);
  dht.setBootstrap("dht.transmissionbt.com", 6881);
  dht.setBootstrap("router.bitcomet.com", 6881);
  dht.setBootstrap("dht.aelitis.com", 6881);
  const loadedNodes = dht.routingTable.load("./rt");
  console.log(`Loaded nodes: ${loadedNodes}`);

  dht.initialie();
  dht.listen((err) => {
    try {
      console.log(`Listening on ${dht.HOST}:${dht.PORT}`);
      dht.pingBootstrap((err, request, rinfo) => {
        if (err) {
          console.log(err.message);
          return;
        }
        if (!request || !rinfo) return;
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
        if (
          dht.routingTable.find((n) => {
            return n.id.equals(node.id);
          })
        ) {
          console.log(`contact ${node.id} already saved ✔️`);
        dht.BOOTSTRAP_NODE_LOADED = true;
          return;
        }
        dht.routingTable.insert(node);
        console.log(`contact ${node.id} saved ✔️`);
      });
    } catch (err: unknown) {
      if (err instanceof Error) console.log(err.message);
    }
  });
  const calledNodes: NodeInfo[] = [];
  const checkerId = setInterval(() => {
    if (!dht.BOOTSTRAP_NODE_LOADED) return;
    // Run after bootstrap node is loaded
    clearInterval(checkerId);

    let nearest = dht.routingTable.findNearest(dht.ID, 10);
    calledNodes.push(...nearest);
    const fillHandler = (
      err: Error | null,
      request?: unknown,
      rinfo?: RemoteInfo
    ) => {
      if (err) {
        console.error(err);
        return;
      }

      const r = request as {
        t: Buffer;
        y: string;
        r: { id: Buffer; nodes: string };
      };
      /**
       * Response = {"t":"aa", "y":"r", "r": {"id":"0123456789abcdefghij", "nodes": "def456..."}}
       */
      // Check if buffer can be parsed
      let nodeInfosBuffer: Buffer[] = [];
      if (r.r.nodes.length % 26 !== 0) {
        throw new Error(`Unable to parse compact node info`);
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

      // Save the response
      nodes.forEach((node) => {
        const f = dht.routingTable.find((n) => {
          return node.id.equals(n.id);
        });
        if (f === null) {
          dht.routingTable.insert(node);
        }
      });

      // Repeat queary
      let newNearestNode = dht.routingTable.findNearest(dht.ID, 10);
      newNearestNode = newNearestNode.filter((nNNode: NodeInfo) => {
        const found = calledNodes.find((cNode: NodeInfo) => {
          return nNNode.id.equals(cNode.id);
        });
        if (found) return true;
        else false;
      });
      if (newNearestNode.length === 0) {
        dht.routingTable.save("./rt");
        return;
      }
      dht.fill(newNearestNode, dht.ID, fillHandler);
    };
     dht.fill(nearest, dht.ID, fillHandler);
  }, 10000);
}
