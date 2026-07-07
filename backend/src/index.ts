import "dotenv/config";
import path from "node:path";
import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { authRouter } from "./routes/auth.js";
import { lineAuthRouter } from "./routes/lineAuth.js";
import { apiRouter } from "./routes/index.js";
import { platformRouter } from "./routes/platform/index.js";
import { getUploadRoot } from "./lib/photoStorage.js";
import { getServiceRequestUploadRoot } from "./lib/serviceRequestPhotoStorage.js";
import { guestPublicRouter } from "./routes/guestPublic.js";
import { lineWebhookRouter } from "./routes/lineWebhook.js";
import { startAlertScheduler, stopAlertScheduler } from "./services/alertSchedulerService.js";
import { prisma } from "./lib/prisma.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
// LINE Webhook 需 raw body 驗簽（必須在 express.json 之前掛載）
app.use(
  "/api/v1/line/webhook",
  express.raw({ type: "application/json" }),
  lineWebhookRouter,
);

app.use(express.json({ limit: "15mb" }));

app.use(
  "/api/v1/uploads/tickets",
  express.static(path.join(getUploadRoot())),
);

app.use(
  "/api/v1/uploads/service-requests",
  express.static(path.join(getServiceRequestUploadRoot())),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "glog-api" });
});

// 住客掃碼 API（免登入）
app.use("/api/guest", guestPublicRouter);

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/auth/line", lineAuthRouter);
app.use("/api/v1", apiRouter);
app.use("/api/platform/v1", platformRouter);

app.use(errorHandler);

const server = app.listen(PORT, () => {
  console.log(`glog API server running on http://localhost:${PORT}`);
  startAlertScheduler();
});

let shuttingDown = false;

function shutdown(signal: string) {
  if (shuttingDown) {
    process.exit(0);
    return;
  }
  shuttingDown = true;

  console.log(`收到 ${signal}，正在關閉伺服器…`);
  stopAlertScheduler();

  const forceExit = setTimeout(() => {
    console.log("[Shutdown] 強制結束");
    process.exit(0);
  }, 1500);
  forceExit.unref();

  if (typeof server.closeAllConnections === "function") {
    server.closeAllConnections();
  }

  server.close(() => {
    void prisma.$disconnect().finally(() => {
      clearTimeout(forceExit);
      process.exit(0);
    });
  });
}

if (process.env.NODE_ENV !== "production") {
  const instantKill = () => process.exit(0);
  process.on("SIGTERM", instantKill);
  process.on("SIGINT", instantKill);
} else {
  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
