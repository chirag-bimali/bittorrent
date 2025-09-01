// Examples:
// - decodeBencode("5:hello") -> "hello"
// - decodeBencode("10:hello12345") -> "hello12345"

function decodeBencode(bencodedValue: string): string | number {
  // Check integer
  if (bencodedValue.startsWith("i") && bencodedValue.endsWith("e")) {
    const valueString = parseInt(bencodedValue.slice(1, -1));
    if (isNaN(valueString))
      throw new Error(`Invalid encoded value ${valueString}`);
    return valueString;
  }

  // Check for strings
  const firstColonIndex = bencodedValue.indexOf(":");
  const stringLength = parseInt(bencodedValue.substring(0, firstColonIndex));

  if (!isNaN(stringLength)) {
    if (firstColonIndex === -1) {
      throw new Error("Invalid encoded value");
    }
    return JSON.stringify(bencodedValue.substring(firstColonIndex + 1));
  }
  throw new Error("Only string and number are supported for now");
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
