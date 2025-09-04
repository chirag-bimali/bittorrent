export type Dictionary = { [key: string]: any };

export interface BencodeDecoder {
  decodeBencodeString: (bencodedValue: string) => [string, number];
  decodeBencodeInteger: (bencodedValue: string) => [number, number];
  decodeBencodeList: (bencodedValue: string) => [Array<any>, number];
  decodeBencodeDictonary: (bencodedValue: string) => [Dictionary, number];
  decodeBencode: (
    bencodedValue: string
  ) => string | number | Array<any> | Dictionary;
}

export interface BencodeEncoder {
  bencodeInteger: (integer: number) => string;
  bencodeString: (str: string) => string;
  bencodeList: (array: Array<any>) => string;
  bencodeDictonary: (obj: Dictionary) => string;
}
