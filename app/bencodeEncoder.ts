import type { Dictionary } from "./types";

export function bencodeInteger(integer: number): string {
  return `i${integer}e`;
}
export function bencodeString(str: string): string {
  return `${str.length}:${str}`;
}

export function bencodeList(array: Array<any>): string {
  let value = "l";
  for (const item of array) {
    if (typeof item === "string") {
      value += bencodeString(item);
      continue;
    } else if (typeof item == "number") {
      value += bencodeInteger(item);
    } else if (Array.isArray(item)) {
      value += bencodeList(item);
    } else if (typeof item === "object" && item !== null) {
      value += bencodeDictonary(item);
    }
  }
  return value + "e";
}

export function bencodeDictonary(obj: Dictionary): string {
  let value = "d";
  const sortedKeys = Object.keys(obj).sort();
  for (const key of sortedKeys) {
    value += bencodeString(key);

    const val = obj[key];
    if (typeof val === "string") {
      value += bencodeString(val);
    } else if (typeof val === "number") {
      value += bencodeInteger(val);
    } else if (Array.isArray(val)) {
      value += bencodeList(val);
    } else if (typeof val === "object" && val !== null) {
      value += bencodeDictonary(val);
    }
  }
  return value + "e";
}
