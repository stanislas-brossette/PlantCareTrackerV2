import sharp from "sharp";
import path from "path";
import fs from "fs/promises";
import { v4 as uuid } from "uuid";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const MAX_SIZE = 800;

export async function ensureUploadDir() {
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}

export async function saveImage(buffer: Buffer, mimeType: string): Promise<string> {
  await ensureUploadDir();
  const ext = mimeType === "image/png" ? "png" : "jpg";
  const filename = `${uuid()}.${ext}`;
  const filepath = path.join(UPLOAD_DIR, filename);

  await sharp(buffer)
    .resize(MAX_SIZE, MAX_SIZE, { fit: "cover", position: "center" })
    .jpeg({ quality: 85 })
    .toFile(filepath.replace(`.${ext}`, ".jpg"));

  return `/uploads/${filename.replace(`.${ext}`, ".jpg")}`;
}

export async function deleteImage(url: string) {
  const filename = path.basename(url);
  const filepath = path.join(UPLOAD_DIR, filename);
  try {
    await fs.unlink(filepath);
  } catch {
    // ignore if already gone
  }
}
