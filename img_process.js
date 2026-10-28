import isJpg from "is-jpg";
import sharp from "sharp";

export const isImage = (url) => {
  if (url === null) return false;
  const imageExtensions = [".jpg", ".jpeg", ".png", ".gif", ".heic"];
  return imageExtensions.some((ext) => url.toLowerCase().endsWith(ext));
};

export const isVideo = (url) => {
  if (url === null) return false;
  const videoExtensions = [".mp4", ".mov", ".webp", ".mp3", ".webm", ".ogg"];
  return videoExtensions.some((ext) => url.toLowerCase().endsWith(ext));
};

export const convertToJpg = async (input) => {
  if (isJpg(input)) {
    return input;
  }

  return sharp(input).jpeg({ force: true }).toBuffer();
};
