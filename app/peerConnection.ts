import { type MessageTypes, type Peer, type Piece } from "./types";
import type { Socket } from "net";

import * as net from "net"; // <- typed import so editor shows net.Socket, net.connect, etc.

export class Request {
  public rawBuffer: Buffer;
  public type: MessageTypes;
  public data?: Buffer | null = null;
  public infoHash: Buffer | null = null;
  public peerId: Buffer | null = null;

  constructor(rawBuffer: Buffer) {
    this.rawBuffer = rawBuffer;
    this.type = this.messageType(rawBuffer);
    if (this.type === "handshake") {
      this.infoHash = this.rawBuffer.subarray(28, 48);
      this.peerId = this.rawBuffer.subarray(48, 68);
    }
    if (this.type === "bitfield") {
    }
    this.data = rawBuffer.subarray(5, this.rawBuffer.readInt32BE(0) - 1);
  }
  readBitByBit(
    buffer: Buffer,
    callback: (bit: 0 | 1, byteIndex: number, bitIndex: number) => void
  ) {
    const bytesNum = buffer.length;
    for (let i = 0; i < 8 * bytesNum; i++) {
      const byteIndex = Math.floor(i / 8);
      const mask = 1 << (7 - i);
      const bit = (buffer[byteIndex] & mask) === 0 ? 0 : 1;
      callback(bit, byteIndex, i);
    }
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

  handshake(infoHash: Buffer, clientId: Buffer): void {
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
  request(piece: Piece, begin: number, length: number) {
    const message = Buffer.concat([
      Buffer.from([Buffer.alloc(4).writeInt32BE(13), 6]),
      Buffer.from([
        Buffer.alloc(4).writeInt32BE(piece.index),
        Buffer.alloc(4).writeInt32BE(begin),
        Buffer.alloc(4).writeInt32BE(length),
      ]),
    ]);
    // const messageLength = Buffer.alloc(4);
    // messageLength.writeInt32BE(message.length);

    // const totalMessage = Buffer.concat([messageLength, message]);
    this.connection.write(message);
  }

  keepAlive() {
    this.connection.write(Buffer.alloc(4, 0));
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
  public response: Response | null = null;
  public connection: Socket | null = null;
  public readonly PROTOCOL_NAME = "BitTorrent protocol";
  public peer: Peer;
  public pieces: Piece[] = [];
  public infoHash: Buffer;
  public choked: boolean = true;
  private events: Record<
    string,
    (request: Request, response: Response) => void
  > = {};

  constructor(peer: Peer, infoHash: Buffer, pieces: Piece[]) {
    this.peer = peer;
    this.infoHash = infoHash;
    pieces.forEach((value) => {
      this.pieces.push({
        hash: value.hash,
        index: value.index,
        have: false,
      });
    });
  }

  connect(callback?: (response: Response) => void) {
    this.connection = net.createConnection(
      { host: this.peer.host, port: this.peer.port },
      () => {
        if (this.connection) {
          this.response = new Response(this.connection);
          if (callback) callback(this.response);
        }
      }
    );
  }

  listen(callback: () => void | null) {
    if (!this.connection) throw new Error(`Socket not initialized`);

    const setupListeners = () => {
      if (this.connection === null) throw new Error(`Socket not initialized`);
      this.connection.on("data", (buffer: Buffer) => {
        if (this.response === null) throw new Error(`Response not initialized`);
        let buffers: Buffer[];
        let leftover: Buffer | null = null;
        let buf = buffer;

        if (leftover !== null) {
          buf = Buffer.concat([leftover, buffer]);
        }
        [buffers, leftover] = this.deserializeStream(buf);
        for (const buf of buffers) {
          const request = new Request(buf);
          this.events[request.messageType(buf)]?.(request, this.response);
        }
      });

      this.connection.on("error", (err) => {
        throw new Error(err.message);
      });
      this.connection.on("close", () => {
        console.log(`Connection closed`);
      });
      if (callback) callback();
    };
    if (this.connection.readyState === "open") {
      setupListeners();
    } else if (
      this.connection.connecting ||
      this.connection.readyState === "opening"
    ) {
      this.connection.once("connect", () => {
        setupListeners();
      });
    } else
      throw new Error(
        `Socket is not connected. readyState ${this.connection.readyState}`
      );
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
        break;
      } else if (buffer.length >= 4 && buffer.readInt32BE(0) === 0) {
        // keep-alive message
        if (buffer.length > 4) {
          const message = buffer.subarray(0, 3);
          buffers.push(message);
          buffer = buffer.subarray(4);
          continue;
        }
        buffers.push(buffer);
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
          continue;
        }
        break;
      } else break;
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
