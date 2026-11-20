import { mkdtempSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { NodeFileSystem } from "@effect/platform-node"
import { describe, expect, it } from "@effect/vitest"
import { Effect, Layer, Option } from "effect"
import { DomoConfig } from "../src/config/DomoConfig.ts"
import { Images } from "../src/images/Images.ts"

const layer = () =>
  Images.layer.pipe(
    Layer.provide(
      DomoConfig.layerFrom({ home: mkdtempSync(join(tmpdir(), "domo-img-")), port: 0 }),
    ),
    Layer.provide(NodeFileSystem.layer),
  )

describe("Images", () => {
  it.effect("saves an image, finds it by id, and hands it to a run as file and base64", () =>
    Effect.gen(function* () {
      const images = yield* Images
      const bytes = new Uint8Array([137, 80, 78, 71])
      const ref = yield* images.save(bytes, "image/png")
      expect(ref.mediaType).toBe("image/png")
      const found = yield* images.find(ref.id)
      expect(Option.map(found, (f) => f.path.endsWith(`${ref.id}.png`))).toEqual(Option.some(true))
      const [run] = yield* images.forRun([ref])
      expect(run?.data).toBe(Buffer.from(bytes).toString("base64"))
      expect(run?.path).toContain(join("images", `${ref.id}.png`))
    }).pipe(Effect.provide(layer())),
  )

  it.effect("refuses other file types, empty files and odd ids", () =>
    Effect.gen(function* () {
      const images = yield* Images
      const wrongType = yield* images.save(new Uint8Array([1]), "text/html").pipe(Effect.flip)
      expect(wrongType.message).toContain("PNG, JPEG")
      const empty = yield* images.save(new Uint8Array(), "image/png").pipe(Effect.flip)
      expect(empty._tag).toBe("ImageRejected")
      expect(Option.isNone(yield* images.find("../token"))).toBe(true)
    }).pipe(Effect.provide(layer())),
  )
})
