import type { RemoteInfo } from "dgram";
import DHT, { type NodeInfo } from "./DHT";

class DHTManager extends DHT {
  constructor(maxIdSpace: bigint, client: Buffer) {
    super(maxIdSpace, client)
  }
  start() {
    // table fill
    // if not fill the table
    // if filled
    // run node refresh operation
    // run bucket refresh operation 
  }


}