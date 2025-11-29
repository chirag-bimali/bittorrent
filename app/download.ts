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
        const node: NodeInfo = {
          id: Buffer.from(request.r.id, "binary"),
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
        dht.BOOTSTRAP_NODE_LOADED = true;
        console.log(`contact ${node.id} saved ✔️`);
      });
    } catch (err: unknown) {
      if (err instanceof Error) console.log(err.message);
    }
  });

  const calledNodes: NodeInfo[] = [];
  let nearest = dht.routingTable.findNearest(dht.ID, 40);
  calledNodes.push(...nearest);
  const fillHandler = (
    err: Error | null,
    nodes?: NodeInfo[],
    rinfo?: RemoteInfo
  ) => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(nodes);
    console.log(rinfo);
    if (!(nodes && rinfo)) return;

    console.log(nodes);
    console.log(rinfo);

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
    let newNearestNode = dht.routingTable.findNearest(dht.ID, 40);

    // Filter already queried node
    newNearestNode = newNearestNode.filter((nNNode: NodeInfo) => {
      const found = calledNodes.find((cNode: NodeInfo) => {
        return nNNode.id.equals(cNode.id);
      });
      if (found) return true;
      else false;
    });
    calledNodes.push(...newNearestNode);

    if (newNearestNode.length !== 0) {
      dht.fill(newNearestNode, dht.ID, fillHandler);
      return;
    }

    dht.routingTable.save("./rt");
    console.log(`saved!`);
  };

  const interval = setInterval(() => {
    if (dht.BOOTSTRAP_NODE_LOADED) clearInterval(interval);
    else return;
    if (loadedNodes > 100) return;
    dht.fill(nearest, dht.ID, fillHandler);
  }, 2000);
}
