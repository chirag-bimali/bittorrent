import fs from "fs";
import type {} from "./types";
import Torrent from "./Torrent";

const OPTION_DOWNLOAD_PATH = "-download";
const OPTION_TORRENT_PATH = "-torrent";

function argumentParser(args: string[]): {
  download: string;
  torrent: string;
} {
  const downloadOptionIndex = args.findIndex((arg) => {
    return arg === OPTION_DOWNLOAD_PATH;
  });

  if (downloadOptionIndex < 0 && !args[downloadOptionIndex + 1]) {
    throw new Error("Download path not specified");
  }

  const torrentPathOptionIndex = args.findIndex((arg) => {
    return arg === OPTION_TORRENT_PATH;
  });
  if (torrentPathOptionIndex < 0 && !args[torrentPathOptionIndex + 1]) {
    throw new Error("Torrent file path not specified");
  }
  const downloadPath = args[downloadOptionIndex + 1];
  const torrentFilePath = args[torrentPathOptionIndex + 1];
  return {
    download: downloadPath,
    torrent: torrentFilePath,
  };
}
export default function download(args: string[]) {
  const argObj = argumentParser(args);
  const torrentString = fs.readFileSync(argObj.torrent, "binary");
  const torrent = new Torrent(torrentString);
  torrent.lsdEnable();
  
}
