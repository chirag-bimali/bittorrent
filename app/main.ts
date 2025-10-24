import fs, { existsSync } from "fs";
import crypto from "crypto";
import net from "net";

import type {
  BencodeDecoderStatic,
  BencodeEncoderStatic,
  Dictionary,
  Piece,
} from "./types";

import BencodeDecoderDefault from "./bencodeDecoder";
const BencodeDecoder = BencodeDecoderDefault as BencodeDecoderStatic;

import BencodeEncoderDefault from "./bencodeEncoder";
import Torrent from "./torrent";
import { PeerConnection, Request, Response } from "./peerConnection";
import path from "path";
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
      const peers = await torrent.fetchPeers();

      console.log(`List of available peers:\n`);
      let i = 1;
      for (const peer of peers) {
        console.log(peer);
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

    // await torrent.connect(hostAndPort[0], parseInt(hostAndPort[1]));
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
    console.log(output);
    const torrentFileLocation = args[5];
    const peerLocation = args[6];

    const pieceIndex = args[7];
    const torrentData = fs.readFileSync(torrentFileLocation);
    const torrentString = torrentData.toString("binary");

    const [peerIp, peerPort] = peerLocation.split(":");
    const clientId = generateId(20);

    const torrent: Torrent = new Torrent(torrentString);

    if (!(fs.existsSync(output) && fs.statSync(output).isDirectory())) {
      const dir = fs.mkdirSync(output, { recursive: true });
      if (dir !== output) {
        console.error(`Unable to create directory`);
        throw new Error("Unable to create directory");
      }
      if (!fs.existsSync(path.join(output, torrent.fileName))) {
        fs.writeFileSync(path.join(output, torrent.fileName), "");
        fs.truncateSync(path.join(output, torrent.fileName), torrent.size);
      }
    }
    const fd = fs.openSync(path.join(output, torrent.fileName), "w+");

    const availablePeers = await torrent.fetchPeers();
    const matched = availablePeers.find(({ host, port }) => {
      return host === peerIp && peerPort === port.toString();
    });
    if (!matched) throw new Error(`Peers '${peerIp}:${peerPort}' not found`);

    const connection = new PeerConnection(
      matched,
      torrent.infoHash,
      torrent.pieces
    );
    connection.connect((response: Response) => {
      response.handshake(torrent.infoHash, clientId);
    });
    connection.listen(() => console.log(`Listening...`));

    connection.onData("keep-alive", (request: Request, response: Response) => {
      console.log(`Keeping alive...`);
      response.keepAlive();
    });
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
          data.data.length;
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
  } catch (error: any) {
    console.error(error.message);
    console.error(`Exiting...`);
  }
}

if (args[2] === "download_piece") downloadPiece();
// if (args[3] === "parse") {
// } else console.error(`Try help to know more!\nExiting...`);
