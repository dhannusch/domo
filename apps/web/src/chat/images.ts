import { type ImageRef, ImageRef as ImageRefSchema } from "@domo/domain"
import { Schema } from "effect"
import { accessToken } from "../remote/token.ts"

/** Longest side sent to the models: plenty for screenshots and photos, small enough to upload fast. */
const MAX_SIDE = 2000
/** PNGs (crisp screenshots) stay PNG up to this size; anything bigger becomes JPEG. */
const PNG_LIMIT = 3 * 1024 * 1024

const decodeRef = Schema.decodeUnknownSync(ImageRefSchema)

const toBlob = (canvas: HTMLCanvasElement, type: string, quality?: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) => (blob === null ? reject(new Error("encode")) : resolve(blob)),
      type,
      quality,
    ),
  )

/**
 * Shrinks a picture to at most 2000px on its longest side and re-encodes it, so a phone photo
 * (often HEIC, many MB) arrives as a JPEG the models can read. GIFs pass through untouched.
 */
export const shrinkImage = async (file: Blob): Promise<Blob> => {
  if (file.type === "image/gif") return file
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && (file.type === "image/jpeg" || file.type === "image/webp")) {
    bitmap.close()
    return file
  }
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()
  if (file.type === "image/png") {
    const png = await toBlob(canvas, "image/png")
    if (png.size <= PNG_LIMIT) return png
  }
  return toBlob(canvas, "image/jpeg", 0.85)
}

const withToken = (path: string) =>
  accessToken === null ? path : `${path}?token=${encodeURIComponent(accessToken)}`

/** Uploads one image before the message is sent; the message then refers to it by id. */
export const uploadImage = async (file: Blob): Promise<ImageRef> => {
  const body = await shrinkImage(file)
  const response = await fetch("/images", {
    method: "POST",
    body,
    headers: {
      "content-type": body.type,
      ...(accessToken === null ? {} : { authorization: `Bearer ${accessToken}` }),
    },
  })
  if (!response.ok) throw new Error(await response.text())
  return decodeRef(await response.json())
}

/** Where an attached image is shown from (the token rides along, as on the chat's socket). */
export const imageUrl = (ref: ImageRef) => withToken(`/images/${ref.id}`)
