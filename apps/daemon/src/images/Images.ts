import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { FileMediaType, type FileRef, ImageId, ImageMediaType, type ImageRef } from "@domo/domain"
import { Context, Effect, FileSystem, Layer, Option, Schema } from "effect"
import { DomoConfig } from "../config/DomoConfig.ts"

/** Decks with embedded pictures can be large; anything bigger is refused. */
export const MAX_FILE_BYTES = 25 * 1024 * 1024

/** Larger than any photo the app sends after shrinking it; anything bigger is refused. */
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024

const EXTENSIONS: Record<ImageMediaType, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
}

export class ImageRejected extends Schema.TaggedError<ImageRejected>()("ImageRejected", {
  message: Schema.String,
}) {}

const isMediaType = Schema.is(ImageMediaType)
const isImageId = (id: string) => /^[0-9a-f-]{36}$/.test(id)

/** What a run gets for one image: the file for Codex, base64 for Claude. */
export interface RunImage {
  readonly mediaType: ImageMediaType
  readonly path: string
  readonly data: string
}

/**
 * Images the user attaches, kept in `<home>/images/` (named by id, so a message that moves to
 * another topic keeps its pictures). Nothing is deleted.
 */
export class Images extends Context.Service<
  Images,
  {
    save(bytes: Uint8Array, contentType: string): Effect.Effect<ImageRef, ImageRejected>
    /** The file behind an id, if it exists. */
    find(id: string): Effect.Effect<Option.Option<{ path: string; mediaType: ImageMediaType }>>
    forRun(refs: ReadonlyArray<ImageRef>): Effect.Effect<ReadonlyArray<RunImage>>
    /** Keeps a copy of a file Domo hands over (a deck, a PDF, an SVG) in `<home>/attachments/`. */
    saveFile(
      bytes: Uint8Array,
      name: string,
      mediaType: FileMediaType,
    ): Effect.Effect<FileRef, ImageRejected>
    findFile(id: string): Effect.Effect<Option.Option<{ path: string; mediaType: FileMediaType }>>
  }
>()("domo/images/Images") {
  static readonly layer = Layer.effect(
    Images,
    Effect.gen(function* () {
      const fs = yield* FileSystem.FileSystem
      const { home } = yield* DomoConfig
      const dir = join(home, "images")
      const pathOf = (id: string, mediaType: ImageMediaType) =>
        join(dir, `${id}.${EXTENSIONS[mediaType]}`)

      const save = Effect.fn("Images.save")(function* (bytes: Uint8Array, contentType: string) {
        const mediaType = contentType.split(";")[0]?.trim() ?? ""
        if (!isMediaType(mediaType))
          return yield* new ImageRejected({ message: "Send a PNG, JPEG, WebP or GIF image." })
        if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES)
          return yield* new ImageRejected({ message: "That image is empty or larger than 10 MB." })
        const id = ImageId.make(randomUUID())
        yield* fs.makeDirectory(dir, { recursive: true }).pipe(Effect.orDie)
        yield* fs.writeFile(pathOf(id, mediaType), bytes).pipe(Effect.orDie)
        return { id, mediaType }
      })

      const find = Effect.fn("Images.find")(function* (id: string) {
        if (!isImageId(id)) return Option.none()
        for (const mediaType of ImageMediaType.literals) {
          const path = pathOf(id, mediaType)
          if (yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false)))
            return Option.some({ path, mediaType })
        }
        return Option.none()
      })

      const forRun = Effect.fn("Images.forRun")(function* (refs: ReadonlyArray<ImageRef>) {
        const out: Array<RunImage> = []
        for (const ref of refs) {
          const path = pathOf(ref.id, ref.mediaType)
          const bytes = yield* fs.readFile(path).pipe(Effect.option)
          if (Option.isNone(bytes)) continue
          out.push({
            mediaType: ref.mediaType,
            path,
            data: Buffer.from(bytes.value).toString("base64"),
          })
        }
        return out
      })

      const filesDir = join(home, "attachments")
      const fileExtensions: Record<FileMediaType, string> = {
        "application/pdf": "pdf",
        "text/html": "html",
        "image/svg+xml": "svg",
        "text/markdown": "md",
        "text/plain": "txt",
        "text/csv": "csv",
      }
      const filePath = (id: string, mediaType: FileMediaType) =>
        join(filesDir, `${id}.${fileExtensions[mediaType]}`)

      const saveFile = Effect.fn("Images.saveFile")(function* (
        bytes: Uint8Array,
        name: string,
        mediaType: FileMediaType,
      ) {
        if (bytes.length === 0 || bytes.length > MAX_FILE_BYTES)
          return yield* new ImageRejected({ message: "That file is empty or larger than 25 MB." })
        const id = ImageId.make(randomUUID())
        yield* fs.makeDirectory(filesDir, { recursive: true }).pipe(Effect.orDie)
        yield* fs.writeFile(filePath(id, mediaType), bytes).pipe(Effect.orDie)
        return { id, name, mediaType }
      })

      const findFile = Effect.fn("Images.findFile")(function* (id: string) {
        if (!isImageId(id)) return Option.none()
        for (const mediaType of FileMediaType.literals) {
          const path = filePath(id, mediaType)
          if (yield* fs.exists(path).pipe(Effect.orElseSucceed(() => false)))
            return Option.some({ path, mediaType })
        }
        return Option.none()
      })

      return Images.of({ save, find, forRun, saveFile, findFile })
    }),
  )
}
