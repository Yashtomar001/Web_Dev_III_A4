import { Router } from "express";
import User from "../models/User.js";
import { auth } from "../middleware/auth.js";

const router = Router();
router.get("/search", auth, async (req, res) => {
  const q = (req.query.q || "").trim();
  if (q.length < 2) return res.json({ users: [] });
  const users = await User.find({
    _id: { $ne: req.userId },
    username: { $regex: q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" }
  }).select("username avatar lastSeen").limit(15);
  res.json({ users });
});
export default router;
