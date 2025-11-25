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
  static bencodeBuffer({ buf }: { buf: Buffer }): string {
    const hex = buf.toString("base64");
    return `${hex.length}:${hex}`;
  }
  static bencodeDate({ dateObj }: { dateObj: Date }): string {
    const dateString = dateObj.getTime().toString();
    return `${dateString.length}:${dateString}`;
  }

  static bencodeList(array: Array<any>): string {
    if (!Array.isArray(array)) throw new Error(`argument is not type of array`);
    let value = "l";
    for (const item of array) {
      if (typeof item === "string") {
        value += this.bencodeString(item);
      } else if (typeof item == "number") {
        value += this.bencodeInteger(item);
      } else if (Buffer.isBuffer(item)) {
        value += this.bencodeBuffer({ buf: item });
      } else if (Array.isArray(item)) {
        value += this.bencodeList(item);
      } else if (item instanceof Date) {
        value += this.bencodeDate({ dateObj: item });
      } else if (typeof item === "object" && item !== null) {
        value += this.bencodeDictonary(item);
      }
      console.log(value);
    }
    return value + "e";
  }

  static bencodeDictonary(obj: Dictionary): string {
    if (!(typeof obj === "object" && obj !== null))
      throw new Error(`argument is not type of object`);
    let value = "d";
    const sortedKeys = Object.keys(obj).sort();

    for (const key of sortedKeys) {
      value += this.bencodeString(key);

      const val = obj[key];
      if (typeof val === "string") {
        value += this.bencodeString(val);
      } else if (typeof val === "number") {
        value += this.bencodeInteger(val);
      } else if (Buffer.isBuffer(val)) {
        value += this.bencodeBuffer({ buf: val });
      } else if (Array.isArray(val)) {
        value += this.bencodeList(val);
      } else if (val instanceof Date) {
        value += this.bencodeDate({ dateObj: val });
      } else if (typeof val === "object" && val !== null) {
        value += this.bencodeDictonary(val);
      }
    }
    return value + "e";
  }
}

const _static: BencodeEncoderStatic = BencodeEncoder;
export default BencodeEncoder;
