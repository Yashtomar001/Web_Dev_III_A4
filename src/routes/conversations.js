import { Router } from "express";
import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import Message from "../models/Message.js";
import User from "../models/User.js";
import { auth } from "../middleware/auth.js";

const router = Router();
router.get("/", auth, async (req, res) => {
  const chats = await Conversation.find({ members: req.userId })
    .populate("members", "username avatar lastSeen")
    .populate({ path: "lastMessage", populate: { path: "sender", select: "username" } })
    .sort({ lastActivity: -1 });
  const unread = await Message.aggregate([
    { $match: { conversation: { $in: chats.map(c => c._id) }, sender: { $ne: new mongoose.Types.ObjectId(req.userId) }, readBy: { $ne: new mongoose.Types.ObjectId(req.userId) } } },
    { $group: { _id: "$conversation", count: { $sum: 1 } } }
  ]);
  const counts = Object.fromEntries(unread.map(x => [String(x._id), x.count]));
  res.json({ conversations: chats.map(c => ({ ...c.toObject(), unreadCount: counts[String(c._id)] || 0 })) });
});

router.post("/direct", auth, async (req, res) => {
  const { userId } = req.body;
  if (!mongoose.isValidObjectId(userId) || String(userId) === String(req.userId))
    return res.status(400).json({ message: "Choose a valid different user" });
  if (!(await User.exists({ _id: userId }))) return res.status(404).json({ message: "User not found" });
  let chat = await Conversation.findOne({ isGroup: false, members: { $all: [req.userId, userId], $size: 2 } });
  if (!chat) chat = await Conversation.create({ members: [req.userId, userId] });
  chat = await chat.populate("members", "username avatar lastSeen");
  res.status(201).json({ conversation: chat });
});

export default router;
