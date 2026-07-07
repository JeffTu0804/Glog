import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

function isProxyConnectionRefused(err: Error): boolean {
  const e = err as NodeJS.ErrnoException & { errors?: NodeJS.ErrnoException[] };
  if (e.code === "ECONNREFUSED") return true;
  if (err.message.includes("ECONNREFUSED")) return true;
  if (Array.isArray(e.errors) && e.errors.some((inner) => inner.code === "ECONNREFUSED")) {
    return true;
  }
  return false;
}

// 讓開發環境重啟時，立刻強制退出，不留戀任何未完成的計時器
if (process.env.NODE_ENV !== "production") {
  const instantKill = () => {
    process.exit(0);
  };
  process.on("SIGTERM", instantKill);
  process.on("SIGINT", instantKill);
}

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on("error", (err, _req, _res) => {
            if (isProxyConnectionRefused(err)) {
              console.log("⏳ [Vite Proxy] 後端伺服器正在轉身重啟中，請稍候...");
              return;
            }
            console.error("Vite Proxy Error:", err);
          });
        },
      },
    },
  },
});
