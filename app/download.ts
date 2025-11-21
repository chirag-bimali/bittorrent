import fs from "fs";

import type {} from "./types";
import Torrent from "./Torrent";
import DHT from "./DHT";
import type { NodeInfo } from "./DHT";
import type { RemoteInfo } from "dgram";

const OPTION_DOWNLOAD_PATH = "-download";
const OPTION_TORRENT_PATH = "-torrent";

function argumentParser(args: string[]): {
  download: string;
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
    download: downloadPath,
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
        dht.routingTable.insert(node);
        dht.BOOTSTRAP_NODE_LOADED = true;
        console.log(`contact ${node.id} saved ✔️`);
      });
    } catch (err: unknown) {
      if (err instanceof Error) console.log(err.message);
    }
  });
  const calledNodes: NodeInfo[] = []
  const checkerId = setInterval(() => {
    if (!dht.BOOTSTRAP_NODE_LOADED) return;

    clearInterval(checkerId)
    const nearest = dht.routingTable.findNearest(dht.ID, 3)
    dht.fill(nearest, 1, dht.ID, (err: Error | null, request?: unknown, rinfo?: RemoteInfo) => {


    }, calledNodes);
  }, 10000);
}
