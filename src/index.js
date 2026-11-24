import "dotenv/config";
import express from "express";
import http from "http";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { Server } from "socket.io";
import jwt from "jsonwebtoken";
import path from "path";
import { fileURLToPath } from "url";
import { connectDB } from "./config/db.js";
import User from "./models/User.js";
import authRoutes from "./routes/auth.js";
import userRoutes from "./routes/users.js";
import conversationRoutes from "./routes/conversations.js";
import messageRoutes from "./routes/messages.js";

const app = express();
const server = http.createServer(app);
const allowedOrigin = process.env.CLIENT_URL || "http://localhost:5173";
const io = new Server(server, { cors: { origin: allowedOrigin, methods: ["GET", "POST"] } });
app.set("io", io);
app.use(helmet({ crossOriginResourcePolicy: { policy: "cross-origin" } }));
app.use(cors({ origin: allowedOrigin }));
app.use(express.json({ limit: "1mb" }));
app.use("/api", rateLimit({ windowMs: 15 * 60 * 1000, limit: 300 }));
app.use("/uploads", express.static(path.resolve("uploads")));
app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/messages", messageRoutes);

const online = new Map();
io.use((socket, next) => {
  try {
    const token = socket.handshake.auth?.token;
    socket.userId = jwt.verify(token, process.env.JWT_SECRET).id;
    next();
  } catch { next(new Error("Unauthorized")); }
});
io.on("connection", async socket => {
  const id = String(socket.userId);
  const set = online.get(id) || new Set(); set.add(socket.id); online.set(id, set);
  socket.join(id);
  await User.findByIdAndUpdate(id, { lastSeen: new Date() });
  io.emit("presence:update", { userId: id, online: true });

  socket.on("conversation:join", async conversationId => {
    const { default: Conversation } = await import("./models/Conversation.js");
    const allowed = await Conversation.exists({ _id: conversationId, members: socket.userId });
    if (allowed) socket.join(String(conversationId));
  });
  socket.on("typing", ({ conversationId, isTyping }) => {
    socket.to(String(conversationId)).emit("typing", { conversationId, userId: id, isTyping: !!isTyping });
  });
  socket.on("disconnect", async () => {
    const current = online.get(id); current?.delete(socket.id);
    if (!current?.size) {
      online.delete(id);
      await User.findByIdAndUpdate(id, { lastSeen: new Date() });
      io.emit("presence:update", { userId: id, online: false, lastSeen: new Date() });
    }
  });
});

const port = process.env.PORT || 5000;
connectDB(process.env.MONGO_URI).then(() => server.listen(port, () => console.log(`API + Socket.IO listening on ${port}`)))
  .catch(err => { console.error(err.message); process.exit(1); });
