const fs = require("fs");
const crypto = require("crypto");
const net = require("net");
import type { Socket } from "net";

import type {
  BencodeDecoderStatic,
  BencodeEncoderStatic,
  Dictionary,
  Peer,
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
  public peers: Peer[] = [];

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

  async fetchPeers(): Promise<Peer[]> {
    const infoHashEncoded = this.percentEncodeBuffer(this.infoHash);
    const peerIdEncoded = this.percentEncodeBuffer(this.peerId);
    let compact = 0;

    const params = {
      port: `${this.port}`,
      uploaded: `${0}`,
      downloaded: `${0}`,
      left: `${this.left}`,
      compact: `${compact}`,
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
        console.log(ip);
        this.peers.push({
          host: ip.join("."),
          port: port,
        });
      }
    }

    return peersField.map((value: any): Peer => {
      console.log(value)
      const peer: Peer = {
        host: value.ip,
        port: value.port,
        id: value["peer id"],
      };
      return peer;
    });
  }
}
