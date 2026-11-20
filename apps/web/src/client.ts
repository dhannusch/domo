import { DomoRpc } from "@domo/domain"
import { Layer } from "effect"
import { AtomRpc } from "effect/reactivity"
import { RpcClient, RpcSerialization } from "effect/rpc"
import { Socket } from "effect/socket"
import { accessToken } from "./remote/token.ts"

const rpcUrl = () =>
  `${window.location.protocol === "https:" ? "wss" : "ws"}://${window.location.host}/rpc${
    accessToken === null ? "" : `?token=${encodeURIComponent(accessToken)}`
  }`

/**
 * Typed RPC client over one WebSocket. A dropped connection fails the live feed rather than
 * quietly reopening it, so `chatAtom` reconnects through fresh history and nothing that happened
 * while disconnected (a reply finishing, a restart interrupting one) is missed.
 */
export class DomoClient extends AtomRpc.Service<DomoClient>()("DomoClient", {
  group: DomoRpc,
  protocol: RpcClient.layerProtocolSocket().pipe(
    Layer.provide(Socket.layerWebSocket(rpcUrl())),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerNdjson),
  ),
}) {}
