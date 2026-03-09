import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"

export default defineConfig({
  plugins: [react()],
  define: {
    __BUILD_ID__: JSON.stringify(Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6)),
  },
  server: {
    host: "localhost",
    port: 5173,
    strictPort: true,
    allowedHosts: ["localhost"],
  }
})
