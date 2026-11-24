import { Router } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import { auth } from "../middleware/auth.js";

const router = Router();
const uploadDir = path.resolve("uploads");
fs.mkdirSync(uploadDir, { recursive: true });
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${Date.now()}-${Math.random().toString(36).slice(2)}${path.extname(file.originalname).slice(0, 12)}`)
});
const upload = multer({ storage, limits: { fileSize: 8 * 1024 * 1024 } });

router.get("/:conversationId", auth, async (req, res) => {
  const { conversationId } = req.params;
  const chat = await Conversation.findOne({ _id: conversationId, members: req.userId });
  if (!chat) return res.status(404).json({ message: "Conversation not found" });
  const before = req.query.before ? new Date(req.query.before) : new Date();
  const messages = await Message.find({ conversation: conversationId, createdAt: { $lt: before } })
    .populate("sender", "username").sort({ createdAt: -1 }).limit(30);
  res.json({ messages: messages.reverse(), hasMore: messages.length === 30 });
});

router.post("/:conversationId", auth, upload.single("file"), async (req, res) => {
  const chat = await Conversation.findOne({ _id: req.params.conversationId, members: req.userId });
  if (!chat) return res.status(404).json({ message: "Conversation not found" });
  const text = (req.body.text || "").trim();
  if (!text && !req.file) return res.status(400).json({ message: "Message cannot be empty" });
  const message = await Message.create({
    conversation: chat._id, sender: req.userId, text,
    ...(req.file ? { attachment: { url: `/uploads/${req.file.filename}`, originalName: req.file.originalname, mimeType: req.file.mimetype, size: req.file.size } } : {}),
    deliveredTo: [req.userId], readBy: [req.userId]
  });
  chat.lastMessage = message._id; chat.lastActivity = new Date(); await chat.save();
  const populated = await message.populate("sender", "username");
  req.app.get("io").to(String(chat._id)).emit("message:new", populated);
  res.status(201).json({ message: populated });
});

router.post("/:conversationId/read", auth, async (req, res) => {
  const chat = await Conversation.findOne({ _id: req.params.conversationId, members: req.userId });
  if (!chat) return res.status(404).json({ message: "Conversation not found" });
  await Message.updateMany({ conversation: chat._id, sender: { $ne: req.userId }, readBy: { $ne: req.userId } }, { $addToSet: { readBy: req.userId, deliveredTo: req.userId } });
  req.app.get("io").to(String(chat._id)).emit("message:read", { conversationId: String(chat._id), userId: req.userId });
  res.json({ ok: true });
});
export default router;
