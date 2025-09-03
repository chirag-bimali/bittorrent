const fs = require("fs");
const crypto = require("crypto");

type Dictionary = { [key: string]: any };

function decodeBencodeString(bencodedValue: string): [string, number] {
  if (!isNaN(parseInt(bencodedValue[0]))) {
    let digitBuffer = "";

    let indexOfColon = 0;

    for (indexOfColon; bencodedValue[indexOfColon] != ":"; indexOfColon++) {
      digitBuffer += bencodedValue[indexOfColon];
    }

    const digits = parseInt(digitBuffer);

    const value = bencodedValue.slice(
      indexOfColon + 1,
      indexOfColon + 1 + digits
    );

    // return [JSON.stringify(value), digitBuffer.length + 1 + value.length];
    return [value, digitBuffer.length + 1 + value.length];
  }

  throw new Error(`Invalid string bencoded value ${bencodedValue}`);
}

function decodeBencodeInteger(bencodedValue: string): [number, number] {
  // Check integer

  if (bencodedValue.startsWith("i")) {
    const valueString = parseInt(
      bencodedValue.slice(1, bencodedValue.indexOf("e"))
    );

    if (isNaN(valueString))
      throw new Error(`Invalid encoded value type ${valueString}`);

    return [valueString, 1 + valueString.toString().length + 1];
  }

  throw new Error(`Invalid integer bencoded value ${bencodedValue}`);
}

function decodeBencodeList(bencodedValue: string): [Array<any>, number] {
  const arrayBuffer: any[] = [];

  let decodedLength = 1;

  //  Check list

  if (bencodedValue.startsWith("l")) {
    //  Check values

    // First extract values as a whole string

    let valueString = bencodedValue.slice(1);

    do {
      if (valueString.startsWith("i")) {
        const [value, decodedNumberLength] = decodeBencodeInteger(valueString);

        arrayBuffer.push(value);

        valueString = valueString.substring(decodedNumberLength);

        decodedLength += decodedNumberLength;

        continue;
      }

      if (!isNaN(parseInt(valueString[0]))) {
        const [value, decodedStringLength] = decodeBencodeString(valueString);
        arrayBuffer.push(value);
        valueString = valueString.substring(decodedStringLength);
        decodedLength += decodedStringLength;
        continue;
      }

      if (valueString.startsWith("l")) {
        const [array, decodedSubArrayLength] = decodeBencodeList(valueString);
        arrayBuffer.push(array);
        decodedLength += decodedSubArrayLength;
        valueString = valueString.substring(decodedSubArrayLength);
        continue;
      }
      if (valueString.startsWith("d")) {
        const [dictonary, decodeValueLegth] =
          decodeBencodeDictonary(valueString);
        arrayBuffer.push(dictonary);
        decodedLength += decodeValueLegth;
        valueString = valueString.substring(decodeValueLegth);
        continue;
      }

      if (valueString.startsWith("e")) {
        valueString = valueString.substring(1);
        decodedLength++;
        return [arrayBuffer, decodedLength];
      }

      break;
    } while (true);

    return [arrayBuffer, decodedLength];
  }

  throw new Error(`Invalid list bencoded value ${bencodedValue}`);
}

function decodeBencodeDictonary(bencodedValue: string): [Dictionary, number] {
  // d3:cow3:moo4:spam4:eggse

  const dictonaryBuffer: Dictionary = {};
  let valueString = bencodedValue.slice(1);
  let decodedLength = 1;
  if (bencodedValue.startsWith("d")) {
    do {
      if (valueString.startsWith("e")) {
        valueString = valueString.substring(1);
        decodedLength++;
        return [dictonaryBuffer, decodedLength];
      }

      const [key, decodedKeyLength] = decodeBencodeString(valueString);
      valueString = valueString.substring(decodedKeyLength);
      decodedLength += decodedKeyLength;

      if (valueString.startsWith("i")) {
        const [integerValue, decodedValueLength] =
          decodeBencodeInteger(valueString);
        decodedLength += decodedValueLength;
        valueString = valueString.substring(decodedValueLength);
        dictonaryBuffer[key] = integerValue;
        continue;
      }

      if (valueString.startsWith("l")) {
        const [listValue, decodedValueLength] = decodeBencodeList(valueString);
        decodedLength += decodedValueLength;
        valueString = valueString.substring(decodedValueLength);
        dictonaryBuffer[key] = listValue;
        continue;
      }

      if (valueString.startsWith("d")) {
        const [dictonary, decodeValueLegth] =
          decodeBencodeDictonary(valueString);
        decodedLength += decodeValueLegth;
        valueString = valueString.substring(decodeValueLegth);
        dictonaryBuffer[key] = dictonary;
        continue;
      }

      if (!isNaN(parseInt(valueString[0]))) {
        const [value, decodedValueLength] = decodeBencodeString(valueString);
        dictonaryBuffer[key] = value;
        valueString = valueString.substring(decodedValueLength);
        decodedLength += decodedValueLength;
        continue;
      }

      throw new Error(`Invalid dictonary bencoded value ${bencodedValue}`);
    } while (true);
  }

  throw new Error("Invalid encoded value");
}

function decodeBencode(
  bencodedValue: string
): string | number | Array<any> | Dictionary {
  let value;

  let decodedSize;

  if (bencodedValue.startsWith("l"))
    [value, decodedSize] = decodeBencodeList(bencodedValue);
  else if (bencodedValue.startsWith("i"))
    [value, decodedSize] = decodeBencodeInteger(bencodedValue);
  else if (bencodedValue.startsWith("d"))
    [value, decodedSize] = decodeBencodeDictonary(bencodedValue);
  else [value, decodedSize] = decodeBencodeString(bencodedValue);

  return value;
}

function bencodeInteger(integer: number): string {
  return `i${integer}e`;
}
function bencodeString(str: string): string {
  return `${str.length}:${str}`;
}

function bencodeList(array: Array<any>): string {
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

function bencodeDictonary(obj: Dictionary): string {
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

function calculateSHA1(data: string): string {
  return crypto.createHash("sha1").update(data, "binary").digest("hex");
}

const args = process.argv;

const bencodedValue = args[3];

if (args[2] === "decode") {
  // You can use print statements as follows for debugging, they'll be visible when running tests.

  console.error("Logs from your program will appear here!");

  // Uncomment this block to pass the first stage

  try {
    const decoded = decodeBencode(bencodedValue);
    console.log(decoded);

    // console.log(JSON.stringify(decoded));
  } catch (error: any) {
    console.error(error.message);
  }
}

if (args[2] === "info") {
  try {
    const torrentData = fs.readFileSync(args[3]);
    const torrentString = torrentData.toString("binary");
    const decoded: any = decodeBencode(torrentString);
    console.log(`Tracker URL: ${decoded.announce}`);
    console.log(`Length: ${decoded.info.length}`);
    const encodedInfo = bencodeDictonary(decoded.info);
    const infoHash = calculateSHA1(encodedInfo);
    console.log(`Info Hash: ${infoHash}`);
    console.log(`Piece Length: ${decoded.info["piece length"]}`);

    const pieces = decoded.info.pieces;

    const pieceLength = 20;

    console.log("Piece Hashes");

    for (let i = 0; i < pieces.length; i += pieceLength) {
      const pieceHash = pieces.substring(i, i + pieceLength);

      const hexHash = Array.from<string>(pieceHash)
        .map((char) => char.charCodeAt(0).toString(16).padStart(2, "0"))
        .join("");

      console.log(hexHash);
    }

  } catch (error: any) {
    console.error(error.message);
  }
}


