import type {
  BencodeDecoderStatic,
  BencodeEncoderStatic,
  Dictionary,
} from "./types";
class BencodeEncoder {
  static bencodeInteger(integer: number): string {
    return `i${integer}e`;
  }
  static bencodeString(str: string): string {
    return `${str.length}:${str}`;
  }

  static bencodeList(array: Array<any>): string {
    let value = "l";
    for (const item of array) {
      if (typeof item === "string") {
        value += this.bencodeString(item);
        continue;
      } else if (typeof item == "number") {
        value += this.bencodeInteger(item);
      } else if (Array.isArray(item)) {
        value += this.bencodeList(item);
      } else if (typeof item === "object" && item !== null) {
        value += this.bencodeDictonary(item);
      }
    }
    return value + "e";
  }

  static bencodeDictonary(obj: Dictionary): string {
    let value = "d";
    const sortedKeys = Object.keys(obj).sort();
    for (const key of sortedKeys) {
      value += this.bencodeString(key);

      const val = obj[key];
      if (typeof val === "string") {
        value += this.bencodeString(val);
      } else if (typeof val === "number") {
        value += this.bencodeInteger(val);
      } else if (Array.isArray(val)) {
        value += this.bencodeList(val);
      } else if (typeof val === "object" && val !== null) {
        value += this.bencodeDictonary(val);
      }
    }
    return value + "e";
  }
}

const _static: BencodeEncoderStatic = BencodeEncoder;
export default BencodeEncoder;
