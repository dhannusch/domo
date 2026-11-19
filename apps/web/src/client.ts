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

/** Typed RPC client over one WebSocket; reconnects on its own. */
export class DomoClient extends AtomRpc.Service<DomoClient>()("DomoClient", {
  group: DomoRpc,
  protocol: RpcClient.layerProtocolSocket({ retryTransientErrors: true }).pipe(
    Layer.provide(Socket.layerWebSocket(rpcUrl())),
    Layer.provide(Socket.layerWebSocketConstructorGlobal),
    Layer.provide(RpcSerialization.layerNdjson),
  ),
}) {}
