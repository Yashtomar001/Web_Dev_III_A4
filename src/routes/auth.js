import { Router } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { auth } from "../middleware/auth.js";

const router = Router();
const safeUser = (u) => ({ _id: u._id, username: u.username, email: u.email, avatar: u.avatar, lastSeen: u.lastSeen });
const tokenFor = (id) => jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: "7d" });

router.post("/register", async (req, res) => {
  try {
    const { username, email, password } = req.body;
    if (!username || !email || !password || password.length < 8)
      return res.status(400).json({ message: "Username, email and password (8+ characters) are required" });
    const cleanUsername = username.trim();
    if (!/^[a-zA-Z0-9_]{3,24}$/.test(cleanUsername))
      return res.status(400).json({ message: "Username must be 3–24 letters, numbers or underscores" });
    const exists = await User.findOne({ $or: [{ email: email.toLowerCase() }, { username: cleanUsername }] });
    if (exists) return res.status(409).json({ message: "Email or username already exists" });
    const user = await User.create({ username: cleanUsername, email, password: await bcrypt.hash(password, 12) });
    res.status(201).json({ token: tokenFor(user._id), user: safeUser(user) });
  } catch (e) { res.status(500).json({ message: "Could not register user" }); }
});

router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email: (email || "").toLowerCase() }).select("+password");
    if (!user || !(await bcrypt.compare(password || "", user.password)))
      return res.status(401).json({ message: "Incorrect email or password" });
    res.json({ token: tokenFor(user._id), user: safeUser(user) });
  } catch { res.status(500).json({ message: "Could not log in" }); }
});

router.get("/me", auth, async (req, res) => {
  const user = await User.findById(req.userId);
  if (!user) return res.status(404).json({ message: "User not found" });
  res.json({ user: safeUser(user) });
});

export default router;
