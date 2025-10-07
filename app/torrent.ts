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
import { PeerConnection } from "./peerConnection";
const BencodeEncoder = BencodeEncoderDefault as BencodeEncoderStatic;

export default class Torrent {
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
    this.decoded = BencodeDecoder.decodeBencode(torrentString) as Dictionary;
    this.infoHash = crypto
      .createHash("sha1")
      .update(BencodeEncoder.bencodeDictonary(this.decoded.info), "binary")
      .digest();
    this.peerId = crypto.randomBytes(20);

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
    const trackerResponse: Dictionary = BencodeDecoder.decodeBencode(
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
  }
}
