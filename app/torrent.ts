const fs = require("fs");
const crypto = require("crypto");
const net = require("net");
import type { Socket } from "net";

import type {
  BencodeDecoderStatic,
  BencodeEncoderStatic,
  Dictionary,
  Peer,
  Piece,
} from "./types";

import BencodeDecoderDefault from "./bencodeDecoder";
const BencodeDecoder = BencodeDecoderDefault as BencodeDecoderStatic;

import BencodeEncoderDefault from "./bencodeEncoder";
import { PeerConnection } from "./peerConnection";
import path from "path";
const BencodeEncoder = BencodeEncoderDefault as BencodeEncoderStatic;

type File = {
  length: number;
  path: string[];
};

export default class Torrent {
  public readonly decoded: Dictionary;
  public readonly infoHash: Buffer<ArrayBuffer>;
  public readonly clientId: Buffer<ArrayBuffer>;
  public readonly PIECE_INDEX_LENGTH: number = 20;
  public readonly pieces: Piece[] = [];
  public port: number = 6881;
  public left: number;
  public peers: Peer[] = [];
  public name: string;
  public size: number;
  public pieceLength: number;
  public files: File[] = [];

  constructor(torrentString: string) {
    this.decoded = BencodeDecoder.decodeBencode(torrentString) as Dictionary;
    this.name = this.decoded.info.name;

    if (this.decoded.info.files) {
      this.decoded.info.files.forEach((element: File) => {
        if (element) this.files.push(element);
      });
    } else {
      this.files.push({ length: this.decoded.info.length, path: [this.name] });
    }
    this.infoHash = crypto
      .createHash("sha1")
      .update(BencodeEncoder.bencodeDictonary(this.decoded.info), "binary")
      .digest();
    this.clientId = crypto.randomBytes(20);
    this.size = this.decoded.info.length;

    // Decode piece indexes
    let totalLength: number = this.decoded.info.length;
    this.left = totalLength;
    let pieceLength: number = this.decoded.info["piece length"] as number;
    const piecesHash: Buffer = Buffer.from(this.decoded.info.pieces, "binary");
    this.pieceLength = pieceLength;

    for (let i = 0; i < this.decoded.info.pieces.length / 20; i++) {
      const begin = i * pieceLength;
      this.pieces.push({
        index: i,
        hash: piecesHash.subarray(i * 20, (i + 1) * 20),
        have: false,
        length:
          begin + pieceLength <= totalLength
            ? pieceLength
            : totalLength - begin,
        data: [],
      });
    }

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

  verifyPiece(piece: Piece): boolean {
    const data = Buffer.concat(
      piece.data.sort((a, b) => a.begin - b.begin).map((item) => item.data)
    );
    if (piece.length !== data.length) return false;
    const hash: Buffer = crypto.createHash("sha1").update(data).digest();
    return hash.equals(piece.hash);
  }

  async fetchPeers(): Promise<Peer[]> {
    const infoHashEncoded = this.percentEncodeBuffer(this.infoHash);
    const clientIdEncoded = this.percentEncodeBuffer(this.clientId);
    let compact = 0;

    const params = {
      port: `${this.port}`,
      uploaded: `${0}`,
      downloaded: `${0}`,
      left: `${this.left}`,
      compact: `${compact}`,
    };

    const paramEncoded = new URLSearchParams(params).toString();
    const url = `${this.decoded.announce}?info_hash=${infoHashEncoded}&peer_id=${clientIdEncoded}&${paramEncoded}`;

    const response = await fetch(url, { method: "GET" });
    const arrayBuf = await response.arrayBuffer();
    const responseString = String.fromCharCode(...new Uint8Array(arrayBuf));
    const trackerResponse: Dictionary = BencodeDecoder.decodeBencode(
      responseString
    ) as Dictionary;
    const peersField = trackerResponse.peers;

    if (compact === 1) {
      const peersBuf = Buffer.from(peersField, "binary");
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
        this.peers.push({
          host: ip.join("."),
          port: port,
        });
      }
    }

    return peersField.map((value: any): Peer => {
      const peer: Peer = {
        host: value.ip,
        port: value.port,
        id: Buffer.from(value["peer id"], "binary"),
      };
      return peer;
    });
  }
}
