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

function generateId(length: number = 20): Buffer {
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
  bencodedValue: string
): Promise<[Array<number>, number][]> {
  const decoded: any = decodeBencode(bencodedValue);
  const encodedInfo = bencodeDictonary(decoded.info);

  let totalFileSize = 0;

  if (decoded.info.files) {
    // Multi-file torrent
    for (const file of decoded.info.files) {
      totalFileSize += file.length;
    }
  }
  // Single file torrent
  else totalFileSize = decoded.info.length;

  const infoHash = crypto
    .createHash("sha1")
    .update(encodedInfo, "binary")
    .digest();
  const peerId = generateId(20);

  const infoHashEscaped = percentEncodeBuffer(infoHash);
  const peerIdEscaped = percentEncodeBuffer(peerId);

  const params = {
    port: `${6881}`,
    uploaded: `${0}`,
    downloaded: `${0}`,
    left: `${totalFileSize}`,
    compact: `${1}`,
  };

  const paramString = new URLSearchParams(params).toString();
  const url = `${decoded.announce}?info_hash=${infoHashEscaped}&peer_id=${peerIdEscaped}&${paramString}`;
  const response = await fetch(url, { method: "GET" });
  const arrayBuf = await response.arrayBuffer();
  const responseString = String.fromCharCode(...new Uint8Array(arrayBuf));

  const trackerResponse: any = decodeBencode(responseString);
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
      const peers = await discoverPeers(torrentString);
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

if (args[2] === "handshake") {
  try {
    const torrentFileLocation = args[3];
    const torrentData = fs.readFileSync(torrentFileLocation);
    const torrentString = torrentData.toString("binary");
    if (args[4] === undefined) {
      throw new Error(`Please specify peer ip and peer port in ip:port format to handshake
eg: bittorrent handshake sample.torrent 192.168.1.1:53439`);
    }
    const hostAndPort = args[4].split(":");
    (async function () {
      const peersIp = await discoverPeers(torrentString);
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
          console.log("Connected to server, sending handshake...");
        }
      );
      client.on("connect", () => {
        console.log("TCP connection established");
      });
      client.on("error", (err: any) => {
        console.error(`Connection error ${err.message}`);
        console.error(`Server may be down or not accepting connection`);
      });
      client.setTimeout(10000);
      client.on("timeout", () => {
        client.end();
        throw new Error(`Connection timed out`);
      });
      client.on("data", (data: any) => {
        console.log(`Handshake response from server: `);
        console.log(data);
      });
      client.on("close", () => {
        console.log("Connection closed");
      });
    })();

    const decoded = decodeBencode(torrentString);
  } catch (error: any) {
    console.error(error.message);
  }
}
