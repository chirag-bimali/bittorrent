const fs = require("fs");
const crypto = require("crypto");
const net = require("net");

import type { BencodeDecoder, BencodeEncoder, Dictionary } from "./types";
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

function decodePeersIp(buf: Buffer): [Array<number>, number][] {
  const peersIp: [number[], number][] = [];
  const splitSequence = 6;
  for (let i = 0; i < buf.length; i += splitSequence) {
    const ip: Array<number> = [buf[i], buf[i + 1], buf[i + 2], buf[i + 3]];
    const port = (buf[i + 4] << 8) | buf[i + 5];

    peersIp.push([ip, port]);
  }
  return peersIp;
}

function percentEncodeBuffer(buf: Buffer): string {
  return Array.from(buf)
    .map((b) => `%${b.toString(16).padStart(2, "0")}`)
    .join("");
}

async function discoverPeers(
  announce: string,
  peerId: Buffer<ArrayBuffer>,
  infoHash: Buffer<ArrayBuffer>,
  port: number = 6881,
  uploaded: number = 0,
  downloaded: number = 0,
  left: number = 0
): Promise<[Array<number>, number][]> {
  const infoHashEncoded = percentEncodeBuffer(infoHash);
  const peerIdEncoded = percentEncodeBuffer(peerId);

  const params = {
    port: `${port}`,
    uploaded: `${uploaded}`,
    downloaded: `${downloaded}`,
    left: `${left}`,
    compact: `${1}`,
  };

  const paramEncoded = new URLSearchParams(params).toString();
  const url = `${announce}?info_hash=${infoHashEncoded}&peer_id=${peerIdEncoded}&${paramEncoded}`;

  const response = await fetch(url, { method: "GET" });
  const arrayBuf = await response.arrayBuffer();
  const responseString = String.fromCharCode(...new Uint8Array(arrayBuf));
  const trackerResponse: Dictionary = decodeBencode(
    responseString
  ) as Dictionary;
  const peersField = trackerResponse.peers;
  const peersBuf = Buffer.from(peersField, "binary");
  const peersIp = decodePeersIp(peersBuf);

  return peersIp;
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

      const decoded: Dictionary = decodeBencode(torrentString) as Dictionary;

      // const peers = await discoverPeers(torrentString);
      const peerId = generateId(20);
      const infoBencode = bencodeDictonary(decoded.info);
      const infoHash = crypto
        .createHash("sha1")
        .update(infoBencode, "binary")
        .digest();

      let left = 0;
      if (decoded.info.files) {
        for (const file in decoded.info.file) {
          left += file.length;
        }
      } else left = decoded.info.length;

      const peers = await discoverPeers(
        decoded.announce,
        peerId,
        infoHash,
        6881,
        0,
        0,
        left
      );

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
    const decoded: Dictionary = decodeBencode(torrentString) as Dictionary;
    const infoBencode: string = bencodeDictonary(decoded.info);
    const infoHash = crypto
      .createHash("sha1")
      .update(infoBencode, "binary")
      .digest();
    const peerId = generateId(20);

    let left = 0;
    if (decoded.info.files) {
      for (const file in decoded.info.files) {
        left += file.length;
      }
    } else left += decoded.info.length;

    if (args[4] === undefined) throw new Error(`Specify peer host:port`);
    const hostAndPort = args[4].split(":");
    const peersIp = await discoverPeers(
      decoded.announce,
      peerId,
      infoHash,
      6881,
      0,
      0,
      left
    );

    if (!hostAndPort[0] || !hostAndPort[1])
      throw new Error(
        `Invalid host:port [${hostAndPort[0]}:${hostAndPort[1]}]`
      );

    let found = false;
    for (const item of peersIp) {
      if (
        hostAndPort[0] === item[0].join(".") &&
        parseInt(hostAndPort[1]) === item[1]
      ) {
        found = true;
        break;
      }
    }
    if (!found)
      throw new Error(`Peer ${hostAndPort[0]}:${hostAndPort[1]} not found.`);

    const client = net.createConnection(
      { host: hostAndPort[0], port: parseInt(hostAndPort[1]) },
      () => {
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
        console.log(`Sending handshake of ${handshake.length} bytes...`);

        client.write(handshake);
      }
    );
    client.on("connect", () => {
      console.log("TCP connection established");
    });

    client.on("data", (chunk: Buffer) => {
      let readBytes = 0;
      const lengthPrefix: number = chunk[readBytes];
      readBytes = readBytes + 1;
      const protocalName: string = chunk
        .subarray(readBytes, lengthPrefix + readBytes)
        .toString();

      readBytes += lengthPrefix;

      // Ignore reserved bytes
      readBytes += 8;

      const infoHash = chunk
        .subarray(readBytes, readBytes + 20)
        .toString("hex");
      readBytes += 20;

      const peerId = chunk.subarray(readBytes, readBytes + 20).toString("hex");
      readBytes += 20;
      console.log(`Peer ID: ${peerId}`);
    });

    client.on("error", (err: any) => {
      console.error(`Connection error ${err.message}`);
      console.error(`Server may be down or not accepting connection`);
    });
    client.on("close", () => {
      console.log("Connection closed");
    });
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
    const pieceIndex = args[6]
    const torrentData = fs.readFileSync(torrentFileLocation);
    const torrentString = torrentData.toString("binary");
    const decoded: Dictionary = decodeBencode(torrentString) as Dictionary;
    const infoBencode: string = bencodeDictonary(decoded.info);

    console.log(output, torrentFileLocation, pieceIndex)

    // console.log(args)


    const infoHash = crypto
      .createHash("sha1")
      .update(infoBencode, "binary")
      .digest();
    const peerId = generateId(20);

    let left = 0;
    if (decoded.info.files) {
      for (const file in decoded.info.files) {
        left += file.length;
      }
    } else left += decoded.info.length;
  } catch (error: any) {
    console.error(error.message);
  }
}

if (args[2] === "download_piece") {
  downloadPiece();
}
