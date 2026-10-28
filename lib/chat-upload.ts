import sharp from "sharp";

export const MAX_CHAT_FILE_BYTES = 5 * 1024 * 1024;
const MAX_MULTIPART_BYTES = MAX_CHAT_FILE_BYTES + 512 * 1024;
const MAX_JSON_BYTES = 32 * 1024;
const MAX_IMAGE_PIXELS = 80_000_000;

async function readBodyWithLimit(request: Request, maxBytes: number) {
  const contentLengthHeader = request.headers.get("content-length");
  if (contentLengthHeader) {
    const contentLength = Number(contentLengthHeader);
    if (Number.isFinite(contentLength) && contentLength > maxBytes) throw new Error("FILE_TOO_LARGE");
  }

  if (!request.body) return Buffer.alloc(0);

  const reader = request.body.getReader();
  const chunks: Buffer[] = [];
  let total = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel("request body too large").catch(() => undefined);
        throw new Error("FILE_TOO_LARGE");
      }
      chunks.push(Buffer.from(value));
    }
  } finally {
    reader.releaseLock();
  }

  return Buffer.concat(chunks, total);
}

function isPdf(input: Buffer) {
  return input.length >= 5 && input.subarray(0, 5).toString("ascii") === "%PDF-";
}

function looksLikeImage(input: Buffer) {
  const isPng = input.length >= 8 && input.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]));
  const isJpeg = input.length >= 3 && input[0] === 255 && input[1] === 216 && input[2] === 255;
  const isWebp = input.length >= 12 && input.subarray(0, 4).toString("ascii") === "RIFF" && input.subarray(8, 12).toString("ascii") === "WEBP";
  const brand = input.length >= 12 ? input.subarray(8, 12).toString("ascii") : "";
  const isHeifFamily = input.length >= 12 && input.subarray(4, 8).toString("ascii") === "ftyp" && ["avif", "avis", "heic", "heix", "hevc", "hevx", "mif1", "msf1"].includes(brand);
  return isPng || isJpeg || isWebp || isHeifFamily;
}

export type ChatAttachmentType = "image" | "pdf" | null;

export async function readChatInput(request: Request) {
  let text = "";
  let file: File | null = null;
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const rawBody = await readBodyWithLimit(request, MAX_MULTIPART_BYTES);

    let form: FormData;
    try {
      const boundedRequest = new Request(request.url, {
        method: "POST",
        headers: { "content-type": contentType },
        body: new Uint8Array(rawBody),
      });
      form = await boundedRequest.formData();
    } catch (error) {
      if (error instanceof Error && error.message === "FILE_TOO_LARGE") throw error;
      throw new Error("BAD_MESSAGE");
    }

    text = String(form.get("text") || "").trim();
    const entry = form.get("file") || form.get("image");
    if (entry && typeof entry !== "string" && entry.size > 0) file = entry;
  } else {
    const rawBody = await readBodyWithLimit(request, MAX_JSON_BYTES);
    let body: unknown;
    try {
      body = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new Error("BAD_MESSAGE");
    }
    if (!body || typeof body !== "object") throw new Error("BAD_MESSAGE");
    const value = body as { text?: unknown };
    text = typeof value.text === "string" ? value.text.trim() : "";
  }

  if (text.length > 4000 || (!text && !file)) throw new Error("BAD_MESSAGE");

  let image: Buffer | null = null;
  let attachmentType: ChatAttachmentType = null;

  if (file) {
    if (file.size > MAX_CHAT_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
    const input = Buffer.from(await file.arrayBuffer());

    if (isPdf(input)) {
      // Store PDFs unchanged. They are served back with Content-Disposition: attachment
      // so browser-active PDF content is not embedded into the MealPoint page.
      image = input;
      attachmentType = "pdf";
    } else {
      if (!looksLikeImage(input)) throw new Error("BAD_FILE");
      try {
        const metadata = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false }).metadata();
        if (!metadata.format || !["jpeg", "png", "webp", "heif"].includes(metadata.format)) throw new Error("BAD_FILE");
        if ((metadata.width || 0) * (metadata.height || 0) > MAX_IMAGE_PIXELS) throw new Error("IMAGE_PIXELS_TOO_LARGE");

        image = await sharp(input, { limitInputPixels: MAX_IMAGE_PIXELS, animated: false })
          .rotate()
          .resize({ width: 2000, height: 2000, fit: "inside", withoutEnlargement: true })
          .webp({ quality: 84 })
          .toBuffer();
        if (image.length > MAX_CHAT_FILE_BYTES) throw new Error("FILE_TOO_LARGE");
        attachmentType = "image";
      } catch (error) {
        if (error instanceof Error && ["FILE_TOO_LARGE", "IMAGE_PIXELS_TOO_LARGE", "BAD_FILE"].includes(error.message)) throw error;
        throw new Error("BAD_FILE");
      }
    }
  }

  return { text, image, attachmentType };
}
