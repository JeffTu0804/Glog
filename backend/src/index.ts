import "dotenv/config";
import cors from "cors";
import express from "express";
import { errorHandler } from "./middleware/errorHandler.js";
import { apiRouter } from "./routes/index.js";
import { platformRouter } from "./routes/platform/index.js";

const app = express();
const PORT = process.env.PORT ?? 3000;

app.use(
  cors({
    origin: process.env.CORS_ORIGIN ?? "http://localhost:5173",
    credentials: true,
  }),
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok", service: "glog-api" });
});

app.use("/api/v1", apiRouter);
app.use("/api/platform/v1", platformRouter);

app.use(errorHandler);

app.listen(PORT, () => {
  console.log(`glog API server running on http://localhost:${PORT}`);
});
