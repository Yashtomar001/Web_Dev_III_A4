import mongoose from "mongoose";

const conversationSchema = new mongoose.Schema({
  members: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", required: true }],
  isGroup: { type: Boolean, default: false },
  name: { type: String, default: "" },
  lastMessage: { type: mongoose.Schema.Types.ObjectId, ref: "Message", default: null },
  lastActivity: { type: Date, default: Date.now }
}, { timestamps: true });

conversationSchema.index({ members: 1, lastActivity: -1 });
export default mongoose.model("Conversation", conversationSchema);
