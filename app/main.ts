import fs, { existsSync } from "fs";
import crypto from "crypto";
import net from "net";
import dgram, { Socket } from "dgram";

import type {
  BencodeDecoderStatic,
  BencodeEncoderStatic,
  Dictionary,
  Piece,
} from "./types";

import BencodeDecoderDefault from "./bencodeDecoder";
const BencodeDecoder = BencodeDecoderDefault as BencodeDecoderStatic;

import BencodeEncoderDefault from "./bencodeEncoder";
import Torrent from "./Torrent";
import { PeerConnection, Request, Response } from "./PeerConnection";
import path from "path";
import download from "./download";
const BencodeEncoder = BencodeEncoderDefault as BencodeEncoderStatic;

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
  return Buffer.from(crypto.randomBytes(length)); // secure random numbers
}

const args = process.argv;

if (args[2] === "decode") {
  try {
    let bencodedValue = args[3];
    if (args[3] === "-f") {
      bencodedValue = fs.readFileSync(args[4]).toString("binary");
      const decoded = BencodeDecoder.decodeBencode(bencodedValue);
    }
    const decoded = BencodeDecoder.decodeBencode(bencodedValue);
    console.log(decoded);
  } catch (error: any) {
    console.error(error.message);
  }
}

if (args[2] === "info") {
  try {
    const torrentData = fs.readFileSync(args[3]);
    const torrentString = torrentData.toString("binary");
    const decoded: any = BencodeDecoder.decodeBencode(torrentString);

    console.log(`Tracker URL: ${decoded.announce}`);
    if (decoded.info.length) console.log(`Length: ${decoded.info.length}`);
    else {
      let length = 0;
      for (const item of decoded.info.files) {
        length += item.length;
      }
      console.log(`Length: ${length}`);
    }
    const encodedInfo = BencodeEncoder.bencodeDictonary(decoded.info);
    const infoHash = calculateSHA1IntoHex(encodedInfo);
    console.log(`Info Hash: ${infoHash}`);
    console.log(`Piece Length: ${decoded.info["piece length"]}`);

    const pieces = decoded.info.pieces;

    const pieceLength = 20;

    console.log("Piece Hashes");

    // for (const hex of extractPieceHashesInHex(pieces, pieceLength)) {
    //   console.log(hex);
    // }
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
      if (torrent.announce) {
        const peers = await torrent.callTracker(torrent.announce);

        if (!peers) return;
        console.log(`List of available peers:\n`);
        let i = 1;

        for (const peer of peers) {
          console.log(peer);
          i++;
        }
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

    if (args[4] === undefined) throw new Error(`Specify peer host:port`);
    const hostAndPort = args[4].split(":");

    if (!hostAndPort[0] || !hostAndPort[1])
      throw new Error(
        `Invalid host:port [${hostAndPort[0]}:${hostAndPort[1]}]`
      );

    // await torrent.connect(hostAndPort[0], parseInt(hostAndPort[1]));
  } catch (error: any) {
    console.error(error.message);
  }
}

if (args[2] === "handshake") {
  handshakeOption();
}
// download_piece -o ./sample-folder chatly.torrent

// options
// - peers: Displays available peers for the client
// - info: Displays the info for torrent file
// - download: Downloads the files from given torrent file

async function main() {
  // Parse file
  // Initialize Class
  // Create File Placeholders
  // Search Peers
  // Download Files
  try {
    // if (args[3] !== "-o") {
    //   throw new Error("Specify the output directory -o");
    // }
    // if (!args[4]) {
    //   throw new Error("Download path not specified")
    // }
    // if (!args[5]) {
    //   throw new Error("Torrent file location not specified")
    // }
    const option = args[2];
    switch (option) {
      case "peers":
        break;
      case "info":
        break;
      case "download":
        download(args.slice(3));
        break;
      default:
        throw new Error(`No option available`);
        break;
    }
  } catch (err) {
    console.error(err);
  }
  throw new Error("Yoyo");

  try {
    if (args[3] !== "-o") {
      throw new Error("Specify the output directory -o");
    }

    const downloadPath = args[4];
    const torrentFileLocation = args[5];
    // const peerLocation = args[6];

    const torrentData = fs.readFileSync(torrentFileLocation);
    const torrentString = torrentData.toString("binary");

    // const [peerIp, peerPort] = peerLocation.split(":");
    const clientId = generateId(20);

    const torrent: Torrent = new Torrent(torrentString);
    torrent.createFilePlaceholders(downloadPath);

    if (torrent.announce) {
      const peers = await torrent.callTracker(torrent.announce);
      if (peers === null) throw new Error(`Unable to find peers`);
      peers.forEach((value, index) => {
        console.log(`${index}: ${value.host}:${value.port}`);
      });

      const matched = peers[0];

      const connection = new PeerConnection(
        matched,
        torrent.infoHash,
        torrent.pieces
      );
      connection.connect((response: Response) => {
        response.handshake(torrent.infoHash, clientId);
      });
      connection.listen(() => console.log(`Listening...`));

      connection.onData(
        "keep-alive",
        (request: Request, response: Response) => {
          console.log(`Keeping alive...`);
          response.keepAlive();
        }
      );
      connection.onData("handshake", (request: Request, response: Response) => {
        console.log(`Handshooked succesfully`);
      });
      connection.onData("bitfield", (request: Request, response: Response) => {
        console.log("Bitfield");
        const payload = request.rawBuffer.subarray(
          3 + 2,
          3 + 2 + request.rawBuffer.readInt32BE(0)
        );

        request.readBitByBit(payload, (bit, byteIndex, bitIndex) => {
          const have = bit === 1;
          const index = byteIndex * 8 + bitIndex;

          if (index < connection.pieces.length) {
            connection.pieces[index].have = have;
          }
        });
        response.bitfield(torrent.pieces);
        response.interested();
      });
      connection.onData("unchoke", (request, response) => {
        const length = Math.pow(2, 14); // 8192
        for (const piece of torrent.pieces) {
          let begin = 0;
          if (!piece.have) {
            while (begin < piece.length) {
              response.request(
                piece,
                begin,
                begin + length > piece.length ? piece.length - begin : length
              );
              begin += length;
            }
          }
        }

        console.log(`Unchoked`);
      });
      connection.onData("piece", (request: Request, response: Response) => {
        const index = connection.pieces.findIndex((piece) => {
          return request.piece?.index === piece.index;
        });
        if (!request.piece?.data) return;

        connection.pieces[index].data.push({
          begin: request.piece.begin,
          data: request.piece.data,
        });
        if (torrent.verifyPiece(connection.pieces[index])) {
          for (const data of connection.pieces[index].data) {
            // fs.openSync()
            fs.writeSync(
              fd,
              data.data,
              0,
              data.data.length,
              index * torrent.pieceLength + data.begin
            );
          }
        }
      });
      connection.onData("choke", (request: Request, response: Response) => {
        console.log(`choked`);
      });
    } else {
      // LSD
    }

    throw new Error(`Just don't go after this`);
  } catch (error: any) {
    console.error(error.message);
    console.error(`Exiting...`);
  }
}

main();

const MULTICAST_ADDR = "239.192.152.143"; // IPv4 LSD group
const PORT = 6771;

if (args[2] === "lsd") {
  const socket = dgram.createSocket({ type: "udp4", reuseAddr: true });
  socket.on("message", (msg: Buffer, rinfo: dgram.RemoteInfo) => {
    console.log(rinfo);
    const text = msg.toString();
    const infoHash = text.match(/Infohash:\s*(\w+)/i);
    const port = text.match(/Port:\s*(\d+)/i);
    if (infoHash && port) {
      console.log(`${rinfo.address}:${port[1]} is serving ${infoHash[1]}`);
    }
  });
  socket.bind(PORT, () => {
    socket.addMembership(MULTICAST_ADDR);
    console.log(`Listening LSD in ${MULTICAST_ADDR}:${PORT}`);
  });
}
// if (args[3] === "parse") {
// } else console.error(`Try help to know more!\nExiting...`);
