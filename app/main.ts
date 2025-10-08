const fs = require("fs");
const crypto = require("crypto");
const net = require("net");
import type { Socket } from "net";

import type {
  BencodeDecoderStatic,
  BencodeEncoderStatic,
  Dictionary,
} from "./types";

import BencodeDecoderDefault from "./bencodeDecoder";
const BencodeDecoder = BencodeDecoderDefault as BencodeDecoderStatic;

import BencodeEncoderDefault from "./bencodeEncoder";
import Torrent from "./torrent";
import { PeerConnection } from "./peerConnection";
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
  return crypto.randomBytes(length); // secure random numbers
}

const args = process.argv;

if (args[2] === "decode") {
  const bencodedValue = args[3];
  console.error("Logs from your program will appear here!");
  try {
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
    console.log(`Length: ${decoded.info.length}`);
    const encodedInfo = BencodeEncoder.bencodeDictonary(decoded.info);
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
    const torrentFileLocation = args[5];
    const peerLocation = args[6];

    const pieceIndex = args[7];
    const torrentData = fs.readFileSync(torrentFileLocation);
    const torrentString = torrentData.toString("binary");

    const [peerIp, peerPort] = peerLocation.split(":");

    const torrent: Torrent = new Torrent(torrentString);

    const availablePeers = await torrent.fetchPeers();
    const matched = availablePeers.find(([ip, port]) => {
      return ip.join(".") === peerIp && peerPort === port.toString();
    });
    if (!matched) throw new Error(`Peers '${peerIp}:${peerPort}' not found`);

    const connection = new PeerConnection(peerIp, Number(peerPort));
    connection.onConnected(() => {
      console.log(`Connected to '${peerIp}:${peerPort}'`);
    });
    connection.handshake(torrent.infoHash, torrent.peerId);
    connection.onData("keep-alive", (): boolean => {
      console.log(`Keeping alive`);
      return true;
    });
    connection.onData("handshake", (): void => {
      console.log("Shooked hand with the peer");
    });
    // connection.onData("handshake-response", () => {
    //   console.log(`Handshake response arrived`);
    // });
  } catch (error: any) {
    console.error(error.message);
    console.error(`Exiting...`);
  }
}

if (args[2] === "download_piece") downloadPiece();
else console.error(`Try help to know more!\nExiting...`);
