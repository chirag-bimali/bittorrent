import dgram from "dgram";
export default class LSD {
  public host: string;
  public port: number;
  private socket: dgram.Socket;

  constructor(host: string, port: number) {
    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.host = host;
    this.port = port;
    this.socket.bind(this.port, () => {
      this.socket.addMembership(this.host);
    });
  }
  onMessage(
    callback: (infoHash: Buffer, address: string, port: number) => void
  ) {
    this.socket.on("message", (msg, rinfo) => {
      const text = msg.toString();
      const infoHash = text.match(/Infohash:\s*(\w+)/i);
      const port = text.match(/Port:\s*(\d+)/i);
      if (infoHash && port) {
        callback(Buffer.from(infoHash[1]), rinfo.address, Number(port[1]));
      }
    });
  }
}
