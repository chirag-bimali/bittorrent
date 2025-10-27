import dgram from "dgram";
export default class LSD {
  public readonly MULTICAST_ADDR_IPV4 = "239.192.152.143"; // IPv4 LSD group
  public readonly MULTICAST_PORT = 6771;
  public host: string;
  public port: number;
  private socket: dgram.Socket;

  constructor(
    host: string = this.MULTICAST_ADDR_IPV4,
    port: number = this.MULTICAST_PORT
  ) {
    this.socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
    this.host = host;
    this.port = port;
    this.socket.bind(this.port, () => {
      this.socket.addMembership(this.host);
    });
  }
  onMessage(
    callback: (infoHash: string, address: string, port: number) => void
  ) {
    this.socket.on("message", (msg, rinfo) => {
      const text = msg.toString();
      const infoHash = text.match(/Infohash:\s*(\w+)/i);
      const port = text.match(/Port:\s*(\d+)/i);
      if (infoHash && port) {
        callback(infoHash[1], rinfo.address, Number(port[1]));
      }
    });
  }
}
