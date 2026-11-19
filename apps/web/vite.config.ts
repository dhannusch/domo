import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

const daemon = `http://127.0.0.1:${process.env.DOMO_PORT ?? "7420"}`

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: { "/rpc": { target: daemon, ws: true } },
  },
})
