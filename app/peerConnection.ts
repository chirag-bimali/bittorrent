import { Socket } from "net";
import { type MessageTypes, type Peer, type Piece } from "./types";

const net = require("net");

export class Request {
  public rawBuffer: Buffer;
  public type: MessageTypes;
  public payload?: string | null = null;

  constructor(rawBuffer: Buffer) {
    this.rawBuffer = rawBuffer;
    this.type = this.messageType(rawBuffer);
  }

  public messageType(buffer: Buffer<ArrayBufferLike>): MessageTypes {
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

    switch (buffer[4]) {
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

export class Response {
  /**
   *
   */
  private connection: Socket;
  constructor(socket: Socket) {
    this.connection = socket;
  }
  interested() {
    this.connection.write(Buffer.from([0, 0, 0, 1, 2]));
  }
  bitfield(pieces: Piece[]) {
    const numbBytes = Math.ceil(pieces.length / 8);
    const bitfield = Buffer.alloc(numbBytes, 0);

    for (let i = 0; i < pieces.length; i++) {
      if (pieces[i].have) {
        const bitIndex = Math.floor(i % 8);
        const bitOffset = 7 - (i % 8);
        const mask = 1 << bitOffset;
        bitfield[bitIndex] = bitfield[bitIndex] | mask;
      }
    }
    this.connection.write(
      Buffer.from([0, 0, 0, bitfield.length + 1, 5, ...bitfield])
    );
  }
}

export class PeerConnection {
  public peer: Peer;
  public connection: Socket;
  public readonly PROTOCOL_NAME = "BitTorrent protocol";
  public infoHash?: Buffer;
  public choked: boolean = true;
  private events: Record<
    string,
    (request: Request, response: Response) => void
  > = {};

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
  listen() {
    const response = new Response(this.connection);

    this.connection.on("data", (buffer: Buffer) => {
      let buffers: Buffer[];
      let leftover: Buffer | null = null;
      let buf = buffer;

      if (leftover !== null) {
        buf = Buffer.concat([leftover, buffer]);
      }
      [buffers, leftover] = this.deserializeStream(buf);
      for (const buf of buffers) {
        const request = new Request(buf);
        this.events[request.messageType(buf)]?.(request, response);
      }
    });
  }

  public deserializeStream(buf: Buffer): [Buffer[], Buffer | null] {
    const buffers: Buffer[] = [];

    let buffer = buf;
    while (buffer.length !== 0) {
      if (
        buffer[0] === 19 &&
        buffer.subarray(1, 20).toString("binary") === `BitTorrent protocol`
      ) {
        if (buffer.length > 68) {
          const message = buffer.subarray(0, 68);
          buffer = buffer.subarray(68);
          buffers.push(message);
          continue;
        }
        buffers.push(buffer);
      } else if (buffer.length >= 4 && buffer.readInt32BE(0) === 0) {
        // keep-alive message
        const message = buffer.subarray(0, 3);
        buffers.push(message);
        if (buffer.length > 4) {
          buffer = buffer.subarray(3);
          continue;
        }
        break;
      } else if (
        buffer.length >= 4 &&
        buffer.readInt32BE(0) !== 0 &&
        buffer.subarray(4).length >= buffer.readInt32BE(0)
      ) {
        const message = buffer.subarray(0, buffer.readInt32BE(0) + 4);
        buffers.push(message);
        if (buffer.length > message.length) {
          buffer = buffer.subarray(4 + buffer.readInt32BE(0));
        }
      } else {
        break;
      }
    }
    if (buffer.length !== 0) return [buffers, buffer];
    else return [buffers, null];
  }

  onConnected(connectionListener: (...args: any) => void): this {
    if (!this.connection) throw new Error(`PeerConnection not initialized`);
    this.connection.on("connect", connectionListener);
    return this;
  }

  onData(
    messageType: MessageTypes,
    callBack: (request: Request, response: Response) => void
  ): this {
    this.events[messageType] = callBack;
    return this;
  }
}
