import type { Socket } from "net";
import { buffer } from "stream/consumers";
import type { Peer } from "./types";

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
  public host: string;
  public port: number;
  public connection: Socket;
  public readonly PROTOCOL_NAME = "BitTorrent protocol";
  public peerId?: Buffer;
  public infoHash?: Buffer;

  constructor(peer: Peer) {
    this.host = peer.host;
    this.port = peer.port;

    this.connection = net.createConnection(
      { host: this.host, port: this.port },
      () => {
        console.log(
          `TCP connection established with ${this.host}:${this.port}`
        );
      }
    );
  }

  handshake(infoHash: Buffer<ArrayBuffer>, peerId: Buffer<ArrayBuffer>): void {
    this.infoHash = infoHash;
    this.peerId = peerId;
    const protocalName = Buffer.from("BitTorrent protocol");
    const lengthPrefix = Buffer.from([protocalName.length]);
    const reservedBytes = Buffer.alloc(8, 0);
    const handshake = Buffer.concat([
      lengthPrefix,
      protocalName,
      reservedBytes,
      infoHash,
      peerId,
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

  onData(messageType: string, callBack: (...args: any[]) => void): this {
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
        if (protocalName !== this.PROTOCOL_NAME)
          throw new Error(`Invalid bittorent protocal handshake message`);

        readBytes += lengthPrefix;

        // 8 reserved bytes;
        readBytes += 8;

        // 20 bytes info hash
        const infoHash = buffer.subarray(readBytes, readBytes + 20);
        readBytes += 20;
        if (this.infoHash && !infoHash.equals(this.infoHash))
          throw new Error(`Info hash not matched`);
        console.log(infoHash);
        console.log(this.infoHash);

        // 20 bytes for peer_id
        const peerId = buffer.subarray(readBytes, readBytes + 20);
        console.log(peerId);
        console.log(this.peerId);
        if (this.peerId && !peerId.equals(this.peerId))
          throw new Error(`Peer id not matched`);

        (
          callBack as (
            lengthPrefix: number,
            protocalName: string,
            infoHash: Buffer,
            peerId: Buffer
          ) => void
        )(lengthPrefix, protocalName, infoHash, peerId);
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

  messageType(buffer: Buffer<ArrayBufferLike>) {
    if (buffer.every((byte) => byte === 0)) return "keep-alive";
    if (buffer[3] === 1 && buffer[4] === 1) return "unchoke";
    if (buffer.length === 4 && buffer[3] === 1 && buffer[4] === 3)
      return "choke";
    if (buffer[3] === 5) return "bitfield";
    if (buffer[3] === 7) return "piece";

    let readBytes = 0;
    const lengthPrefix: number = buffer[readBytes];
    readBytes = readBytes + 1;
    const protocalName: string = buffer
      .subarray(readBytes, lengthPrefix + readBytes)
      .toString();

    if (lengthPrefix == 19 && protocalName === "BitTorrent protocol")
      return "handshake";
  }
}
