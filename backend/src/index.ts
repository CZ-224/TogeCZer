import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";
import helmet from "helmet";

import authRoutes from "./routes/auth.js";
import roomsRoutes from "./routes/rooms.js";
import { attachSocket } from "./socket.js";

const PORT = Number(process.env.PORT) || 4000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || "http://localhost:3000";
const allowedOrigins = CORS_ORIGIN.split(",").map((o) => o.trim());

const app = express();
app.use(helmet());
app.use(
  cors({
    origin: allowedOrigins,
    credentials: true,
  })
);
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/auth", authRoutes);
app.use("/rooms", roomsRoutes);

const server = http.createServer(app);
attachSocket(server, allowedOrigins);

server.listen(PORT, "0.0.0.0", () => {
  // eslint-disable-next-line no-console
  console.log(`API + WebSocket listening on http://0.0.0.0:${PORT}`);
});
