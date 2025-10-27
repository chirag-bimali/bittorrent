import fs from "fs";
import type {} from "./types";
import Torrent from "./Torrent";

const OPTION_DOWNLOAD_PATH = "-download=";
const OPTION_TORRENT_PATH = "-torrent=";

function argumentParser(args: string[]): {
  download: string;
  torrent: string;
} {
  const downloadPathArgs = args.find((arg) => {
    return arg.startsWith(OPTION_DOWNLOAD_PATH);
  });
  if (!downloadPathArgs) {
    throw new Error("Download path not specified");
  }

  const torrentPathArgs = args.find((arg) => {
    return arg.startsWith(OPTION_TORRENT_PATH);
  });
  if (!torrentPathArgs) {
    throw new Error("Torrent file path not specified");
  }
  const downloadPath = downloadPathArgs.substring(OPTION_DOWNLOAD_PATH.length);
  const torrentFilePath = torrentPathArgs.substring(OPTION_TORRENT_PATH.length);
  return {
    download: downloadPath,
    torrent: torrentFilePath,
  };
}
export default function download(args: string[]) {
  const argObj = argumentParser(args);
  const torrentString = fs.readFileSync(argObj.torrent, "binary");
  const torrent = new Torrent(torrentString);
}
