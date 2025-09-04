
import type { Dictionary } from './types';

export function decodeBencodeString(bencodedValue: string): [string, number] {
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

export function decodeBencodeInteger(bencodedValue: string): [number, number] {
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

export function decodeBencodeList(bencodedValue: string): [Array<any>, number] {
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

export function decodeBencodeDictonary(bencodedValue: string): [Dictionary, number] {
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


export function decodeBencode(
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
