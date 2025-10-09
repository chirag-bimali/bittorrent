import type { Socket } from "net";
import { buffer } from "stream/consumers";
import { type MessageTypes, type Peer } from "./types";

const net = require("net");

export class TorrentMessage {
  public rawBuffer: Buffer;
  public messageType: string;
  public payload: string | null;
  constructor(rawBuffer: Buffer, messageType: string, payload: string | null) {
    this.rawBuffer = rawBuffer;
    this.messageType = messageType;
    this.payload = payload;
  }
}

export class PeerConnection {
  public peer: Peer;
  public connection: Socket;
  public readonly PROTOCOL_NAME = "BitTorrent protocol";
  public infoHash?: Buffer;

  constructor(peer: Peer) {
    this.peer = peer;

    this.connection = net.createConnection(
      { host: peer.host, port: peer.port },
      () => {
        console.log(
          `TCP connection established with ${peer.host}:${peer.port}`
        );
      }
    );
  }

  handshake(
    infoHash: Buffer<ArrayBuffer>,
    clientId: Buffer<ArrayBuffer>
  ): void {
    this.infoHash = infoHash;
    const protocalName = Buffer.from("BitTorrent protocol");
    const lengthPrefix = Buffer.from([protocalName.length]);
    const reservedBytes = Buffer.alloc(8, 0);
    const handshake = Buffer.concat([
      lengthPrefix,
      protocalName,
      reservedBytes,
      infoHash,
      clientId,
    ]);
    this.connection.write(handshake);
  }
  onConnected(connectionListener: (...args: any) => void): this {
    if (!this.connection) throw new Error(`PeerConnection not initialized`);
    this.connection.on("connect", connectionListener);
    return this;
  }
  onRawData(callBack: (buffer: Buffer) => void) {
    this.connection.on("data", (buffer: Buffer) => {
      callBack(buffer);
    });
  }
  onData(messageType: "keep-alive", callBack: () => boolean): this;
  onData(
    messageType: "handshake",
    callBack: (
      lengthPrefix: number,
      protocalName: string,
      infoHash: Buffer,
      peerId: Buffer
    ) => void
  ): this;
  onData(messageType: "unchoke", callBack: () => void): this;
  onData(messageType: "piece", callBack: () => void): this;
  onData(messageType: "bitfield", callBack: () => void): this;

  onData(messageType: MessageTypes, callBack: (...args: any[]) => void): this {
    if (messageType === "keep-alive") {
      this.connection.on("data", (buffer) => {
        if (this.messageType(buffer) === "keep-alive") {
          const result = (callBack as () => boolean)();
          if (!result) {
            this.connection.destroy();
            return;
          }
          this.connection.write(Buffer.alloc(4, 0));
        }
      });
      return this;
    }
    if (messageType === "handshake") {
      this.connection.on("data", (buffer) => {
        if (!(this.messageType(buffer) === "handshake")) return;
        let readBytes = 0;
        const lengthPrefix = buffer[readBytes];
        readBytes++;
        if (lengthPrefix !== this.PROTOCOL_NAME.length)
          throw new Error(`Invalid bittorent protocol handshake message`);

        const protocalName = buffer
          .subarray(readBytes, readBytes + lengthPrefix)
          .toString();
        if (protocalName !== this.PROTOCOL_NAME) {
          this.connection.destroy();
          throw new Error(`Invalid bittorent protocal handshake message`);
        }

        readBytes += lengthPrefix;

        // 8 reserved bytes;
        readBytes += 8;

        // 20 bytes info hash
        const infoHash = buffer.subarray(readBytes, readBytes + 20);
        readBytes += 20;
        if (!this.infoHash) throw new Error(`Info hash not found`);
        if (this.infoHash && !infoHash.equals(this.infoHash)) {
          this.connection.destroy();
          throw new Error(`Info hash not matched`);
        }

        // 20 bytes for peer_id
        const peerId = buffer.subarray(readBytes, readBytes + 20);
        if (this.peer.id && !peerId.equals(this.peer.id)) {
          this.connection.destroy();
          throw new Error(`Peer id not matched`);
        }

        callBack();
      });
      return this;
    }
    if (messageType === "unchoke") {
      this.connection.on("data", (buffer) => {
        callBack();

        return;
      });
    }

    throw new Error(`Invalid message type '${messageType}'`);
  }

  messageType(buffer: Buffer<ArrayBufferLike>): MessageTypes {
    if (
      buffer.every((value) => {
        return value == 0;
      })
    )
      return "keep-alive";

    let readBytes = 0;
    const lengthPrefix: number = buffer[readBytes];
    readBytes = readBytes + 1;
    const protocalName: string = buffer
      .subarray(readBytes, lengthPrefix + readBytes)
      .toString();

    if (lengthPrefix == 19 && protocalName === "BitTorrent protocol")
      return "handshake";

    switch (buffer[3]) {
      case 0:
        return "choke";
        break;
      case 1:
        return "unchoke";
        break;
      case 2:
        return "interested";
        break;
      case 3:
        return "not-interested";
        break;
      case 4:
        return "have";
        break;
      case 5:
        return "bitfield";
        break;
      case 6:
        return "request";
        break;
      case 7:
        return "piece";
        break;
      case 8:
        return "cancel";
        break;
      default:
        throw new Error(`Message type not implemented for ${buffer[3]}`);
        break;
    }
  }
}
