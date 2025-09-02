// Examples:
// - decodeBencode("5:hello") -> "hello"
// - decodeBencode("10:hello12345") -> "hello12345"

function decodeBencodeString(bencodedValue: string): [string, number] {
  // Check for strings
  // const stringLength = parseInt(bencodedValue.substring(0, firstColonIndex));

  // if (!isNaN(stringLength)) {
  //   if (firstColonIndex === -1) {
  //     throw new Error("Invalid encoded value");
  //   }
  //   return JSON.stringify(bencodedValue.substring(firstColonIndex + 1));
  // }

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
    return [JSON.stringify(value), digitBuffer.length + 1 + value.length];
  }

  throw new Error("Invalid encoded value");
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
  throw new Error("Invalid encoded value");
}

function decodeBencodeList(bencodedValue: string): [Array<any>, number] {
  const arrayBuffer: any[] = [];
  let decodedLength = 1;
  //  Check list
  if (bencodedValue.startsWith("l")) {
    //  Check values
    // First extract values as a whole string
    let valueString = bencodedValue.slice(1);
    console.log(valueString);
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
      if (valueString.startsWith("e")) {
        valueString = valueString.substring(1);
        decodedLength++;
        return [arrayBuffer, decodedLength];
      }
      break;
    } while (true);

    return [arrayBuffer, decodedLength];
  }

  throw new Error("Invalid encoded value");
}

function decodeBencode(bencodedValue: string): string | number | Array<any> {
  let value;
  let decodedSize;

  if (bencodedValue.startsWith("l"))
    [value, decodedSize] = decodeBencodeList(bencodedValue);
  else if (bencodedValue.startsWith("i"))
    [value, decodedSize] = decodeBencodeInteger(bencodedValue);
  else [value, decodedSize] = decodeBencodeString(bencodedValue);
  return value;
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
  } catch (error) {
    console.error(error.message);
  }
}
