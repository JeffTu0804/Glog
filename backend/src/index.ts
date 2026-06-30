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

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json({ limit: "15mb" }));

app.use(
  "/api/v1/uploads/tickets",
  express.static(path.join(getUploadRoot())),
);

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "glog-api" });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/auth/line", lineAuthRouter);
app.use("/api/v1", apiRouter);
app.use("/api/platform/v1", platformRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`glog API server running on http://localhost:${PORT}`);
});
