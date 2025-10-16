export type Dictionary = { [key: string]: any };

export type MessageTypes =
  | "keep-alive"
  | "handshake"
  | "unchoke"
  | "choke"
  | "interested"
  | "not-interested"
  | "have"
  | "bitfield"
  | "request"
  | "piece"
  | "cancel"
  | "unknown";

export interface BencodeDecoderStatic {
  decodeBencodeString: (bencodedValue: string) => [string, number];
  decodeBencodeInteger: (bencodedValue: string) => [number, number];
  decodeBencodeList: (bencodedValue: string) => [Array<any>, number];
  decodeBencodeDictonary: (bencodedValue: string) => [Dictionary, number];
  decodeBencode: (
    bencodedValue: string
  ) => string | number | Array<any> | Dictionary;
}

export interface BencodeEncoderStatic {
  bencodeInteger(integer: number): string;
  bencodeString(str: string): string;
  bencodeList(array: Array<any>): string;
  bencodeDictonary(obj: Dictionary): string;
}

export type Peer = {
  id?: Buffer;
  host: string;
  port: number;
};

export type Piece = {
  index: number;
  hash: Buffer;
  have: boolean;
};
