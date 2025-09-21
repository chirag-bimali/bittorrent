const fs = require("fs");
const crypto = require("crypto");
const net = require("net");
import type { Socket } from "net";

import type { BencodeDecoder, BencodeEncoder, Dictionary } from "./types";
import { buffer } from "stream/consumers";
// const {   } = require("./bencodeDecoder");
const {
  decodeBencodeString,
  decodeBencodeInteger,
  decodeBencodeList,
  decodeBencodeDictonary,
  decodeBencode,
} = require("./bencodeDecoder") as BencodeDecoder;

const { bencodeDictonary, bencodeInteger, bencodeList, bencodeString } =
  require("./bencodeEncoder") as BencodeEncoder;

function calculateSHA1IntoHex(data: string): string {
  return crypto.createHash("sha1").update(data, "binary").digest("hex");
}

function extractPieceHashesInHex(
  pieces: string,
  pieceLength: number = 20
): string[] {
  const hexHashArray: string[] = [];

  for (let i = 0; i < pieces.length; i += pieceLength) {
    const pieceHash = pieces.substring(i, i + pieceLength);

    const hexHash = Array.from<string>(pieceHash)
      .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
      .join("");
    hexHashArray.push(hexHash);
  }
  return hexHashArray;
}

function generateId(length: number = 20): Buffer<ArrayBuffer> {
  return crypto.randomBytes(length); // secure random numbers
}

class Torrent {
  /**
   *
   */
  public readonly decoded: Dictionary;
  public readonly infoHash: Buffer<ArrayBuffer>;
  public readonly peerId: Buffer<ArrayBuffer>;
  public port: number = 6881;
  public readonly left = 0;
  public client: Socket | null = null;
  public peersIp: [Array<number>, number][] | null = null;

  constructor(torrentString: string) {
    this.decoded = decodeBencode(torrentString) as Dictionary;
    this.infoHash = crypto
      .createHash("sha1")
      .update(bencodeDictonary(this.decoded.info), "binary")
      .digest();
    this.peerId = generateId(20);

    if (this.decoded.info.files) {
      for (const file in this.decoded.info.files) {
        this.left += file.length;
      }
    } else this.left += this.decoded.info.length;
  }

  percentEncodeBuffer(buf: Buffer): string {
    return Array.from(buf)
      .map((b) => `%${b.toString(16).padStart(2, "0")}`)
      .join("");
  }

  async fetchPeers(): Promise<[Array<number>, number][]> {
    try {
      const infoHashEncoded = this.percentEncodeBuffer(this.infoHash);
      const peerIdEncoded = this.percentEncodeBuffer(this.peerId);

      const params = {
        port: `${this.port}`,
        uploaded: `${0}`,
        downloaded: `${0}`,
        left: `${this.left}`,
        compact: `${1}`,
      };

      const paramEncoded = new URLSearchParams(params).toString();
      const url = `${this.decoded.announce}?info_hash=${infoHashEncoded}&peer_id=${peerIdEncoded}&${paramEncoded}`;

      const response = await fetch(url, { method: "GET" });
      const arrayBuf = await response.arrayBuffer();
      const responseString = String.fromCharCode(...new Uint8Array(arrayBuf));
      const trackerResponse: Dictionary = decodeBencode(
        responseString
      ) as Dictionary;
      const peersField = trackerResponse.peers;
      const peersBuf = Buffer.from(peersField, "binary");

      const peersIp: [number[], number][] = [];
      // Decode peers buffer
      const splitSequence = 6;
      for (let i = 0; i < peersBuf.length; i += splitSequence) {
        const ip: Array<number> = [
          peersBuf[i],
          peersBuf[i + 1],
          peersBuf[i + 2],
          peersBuf[i + 3],
        ];
        const port = (peersBuf[i + 4] << 8) | peersBuf[i + 5];

        peersIp.push([ip, port]);
      }

      this.peersIp = peersIp;

      return this.peersIp;
    } catch (error: any) {
      throw new Error(error.message ?? error);
    }
  }

  connect(host: string, port: number): Promise<void> {
    if (this.peersIp === null) throw new Error("No peers found to connect.");

    let found = false;
    for (const item of this.peersIp) {
      if (host === item[0].join(".") && port === item[1]) {
        found = true;
        break;
      }
    }
    if (!found) throw new Error(`Peer ${host}:${port} not found.`);

    return new Promise((resolve, reject) => {
      try {
        this.client = net.createConnection({ host: host, port: port }, () => {
          console.log(`TCP connection established with ${host}:${port}`);
          resolve();
        });

        this.client?.on("connect", () => {
          if (this.client === null)
            throw new Error(`Please establish a connection to handshake.`);

          // Send Handshake message
          const protocalName = Buffer.from("BitTorrent protocol");

          const lengthPrefix = Buffer.from([protocalName.length]);

          const reservedBytes = Buffer.alloc(8, 0);

          const handshake = Buffer.concat([
            lengthPrefix,
            protocalName,
            reservedBytes,
            this.infoHash,
            this.peerId,
          ]);
          console.log(`Sending handshake of ${handshake.length} bytes...`);

          this.client.write(handshake);
        });

        this.client?.on("data", (chunk: Buffer) => {
          // if (chunk.length >= 68) {
          //   let readBytes = 0;
          //   const lengthPrefix: number = chunk[readBytes];
          //   readBytes = readBytes + 1;
          //   const protocalName: string = chunk
          //     .subarray(readBytes, lengthPrefix + readBytes)
          //     .toString();
          //   readBytes += lengthPrefix;
          //   // Ignore reserved bytes
          //   readBytes += 8;
          //   const infoHash = chunk
          //     .subarray(readBytes, readBytes + 20)
          //     .toString("hex");
          //   readBytes += 20;
          //   const peerId = chunk
          //     .subarray(readBytes, readBytes + 20)
          //     .toString("hex");
          //   readBytes += 20;
          //   console.log(`Peer ID: ${peerId}`);
          //   const interestedMessageLength = Buffer.alloc(4);
          //   interestedMessageLength.writeUint32BE(1, 0);
          //   const interestedMessage = Buffer.concat([
          //     interestedMessageLength,
          //     Buffer.from([2]),
          //   ]);
          //   console.log(interestedMessage);
          //   this.client?.write(interestedMessage);
          // } else if (this.messageType(chunk) === "keep-alive") {
          //   this.client?.write(Buffer.from([0, 0, 0, 0]));
          //   console.log(`Keeping-alive...`);
          // } else {
          //   console.log("hello?");
          //   console.log(chunk);
          // }

          if (this.messageType(chunk) === "handshake-response") {
            let readBytes = 0;
            const lengthPrefix: number = chunk[readBytes];
            readBytes = readBytes + 1;
            const protocalName: string = chunk
              .subarray(readBytes, lengthPrefix + readBytes)
              .toString();
            readBytes += lengthPrefix;
            // Ignore reserved bytes
            readBytes += 8;
            const infoHash = chunk.subarray(readBytes, readBytes + 20);

            readBytes += 20;
            const peerId = chunk.subarray(readBytes, readBytes + 20);
            readBytes += 20;
            console.log(`Peer ID: ${peerId}`);

            if (this.peerId.toString("hex") !== peerId.toString("hex")) {
              console.log(`Peer id not matched`);
              console.log(`Connection dropped`);
              this.client?.destroy();
            }

            if (this.infoHash.toString("hex") !== infoHash.toString("hex")) {
              console.log(`Info hash not matched`);
              console.log(`Connection dropped`);
              this.client?.destroy();
            }

            // // Sending interested messages
            // const interestedMessageLength = Buffer.alloc(4);
            // interestedMessageLength.writeUint32BE(1, 0);
            // const interestedMessage = Buffer.concat([
            //   interestedMessageLength,
            //   Buffer.from([2]),
            // ]);
            // console.log(interestedMessage);
            // this.client?.write(interestedMessage);
          }
          if (this.messageType(chunk) === "keep-alive") {
            console.log(`Keep alive`);
            this.client?.write(Buffer.alloc(4, 0));
          }
        });

        this.client?.on("error", (err: any) => {
          console.error(`Connection error ${err.message}`);
          console.error(`Server may be down or not accepting connection`);
          reject();
        });
        this.client?.on("close", () => {
          console.log("Connection closed");
        });
      } catch (error: any) {
        console.error(error.message);
        reject();
      }
    });
  }

  private messageType(buffer: Buffer<ArrayBufferLike>) {
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
      return "handshake-response";
  }
}

const args = process.argv;

if (args[2] === "decode") {
  const bencodedValue = args[3];
  console.error("Logs from your program will appear here!");
  try {
    const decoded = decodeBencode(bencodedValue);
    console.log(decoded);
  } catch (error: any) {
    console.error(error.message);
  }
}

if (args[2] === "info") {
  try {
    const torrentData = fs.readFileSync(args[3]);
    const torrentString = torrentData.toString("binary");
    const decoded: any = decodeBencode(torrentString);
    console.log(`Tracker URL: ${decoded.announce}`);
    console.log(`Length: ${decoded.info.length}`);
    const encodedInfo = bencodeDictonary(decoded.info);
    const infoHash = calculateSHA1IntoHex(encodedInfo);
    console.log(`Info Hash: ${infoHash}`);
    console.log(`Piece Length: ${decoded.info["piece length"]}`);

    const pieces = decoded.info.pieces;

    const pieceLength = 20;

    console.log("Piece Hashes");

    for (const hex of extractPieceHashesInHex(pieces, pieceLength)) {
      console.log(hex);
    }
  } catch (error: any) {
    console.error(error.message);
  }
}

if (args[2] === "peers") {
  try {
    (async function () {
      const torrentData = fs.readFileSync(args[3]);
      const torrentString = torrentData.toString("binary");

      const torrent: Torrent = new Torrent(torrentString);
      const peers = await torrent.fetchPeers();

      console.log(`List of available peers:\n`);
      let i = 1;
      for (const peer of peers) {
        console.log(`\t${i}. ${peer[0].join(".")}:${peer[1]}`);
        i++;
      }
    })();
  } catch (error: any) {
    console.error(error.message);
  }
}

async function handshakeOption() {
  try {
    const torrentFileLocation = args[3];
    const torrentData = fs.readFileSync(torrentFileLocation);
    const torrentString = torrentData.toString("binary");

    const torrent: Torrent = new Torrent(torrentString);
    await torrent.fetchPeers();

    if (args[4] === undefined) throw new Error(`Specify peer host:port`);
    const hostAndPort = args[4].split(":");

    if (!hostAndPort[0] || !hostAndPort[1])
      throw new Error(
        `Invalid host:port [${hostAndPort[0]}:${hostAndPort[1]}]`
      );

    await torrent.connect(hostAndPort[0], parseInt(hostAndPort[1]));
  } catch (error: any) {
    console.error(error.message);
  }
}

if (args[2] === "handshake") {
  handshakeOption();
}

async function downloadPiece() {
  try {
    if (args[3] !== "-o") {
      throw new Error("Specify the output directory -o");
    }
    const output = args[4];
    const torrentFileLocation = args[5];
    const pieceIndex = args[6];
    const torrentData = fs.readFileSync(torrentFileLocation);
    const torrentString = torrentData.toString("binary");

    const torrent: Torrent = new Torrent(torrentString);
  } catch (error: any) {
    console.error(error.message);
  }
}

if (args[2] === "download_piece") {
  downloadPiece();
}
