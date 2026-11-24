import { useEffect, useMemo, useRef, useState } from "react";
import { io } from "socket.io-client";
import EmojiPicker from "emoji-picker-react";
import { api, API } from "./api";
import { Send, Search, LogOut, MessageCircle, Moon, Sun, Paperclip, Smile, ArrowLeft, Plus, Check, CheckCheck, X } from "lucide-react";

const stamp = d => new Date(d).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const day = d => new Date(d).toLocaleDateString([], { month: "short", day: "numeric" });

export default function App() {
  const [token, setToken] = useState(localStorage.getItem("chat_token"));
  const [me, setMe] = useState(null);
  const [mode, setMode] = useState("login");
  const [form, setForm] = useState({ username: "", email: "", password: "" });
  const [error, setError] = useState("");
  const [chats, setChats] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [results, setResults] = useState([]);
  const [online, setOnline] = useState({});
  const [typing, setTyping] = useState(false);
  const [dark, setDark] = useState(true);
  const [showEmoji, setShowEmoji] = useState(false);
  const [mobileChat, setMobileChat] = useState(false);
  const [older, setOlder] = useState(true);
  const bottom = useRef(null), fileRef = useRef(null), socketRef = useRef(null), typingTimer = useRef(null), listRef = useRef(null);

  const activeOther = useMemo(() => active?.members?.find(m => m._id !== me?._id), [active, me]);
  const title = active?.isGroup ? active.name : activeOther?.username;

  useEffect(() => {
    if (!token) return;
    api.get("/auth/me").then(r => setMe(r.data.user)).catch(() => logout());
    api.get("/conversations").then(r => setChats(r.data.conversations)).catch(e => setError(e.response?.data?.message || "Could not load chats"));
  }, [token]);

  useEffect(() => {
    if (!token || !me) return;
    const s = io(API, { auth: { token } }); socketRef.current = s;
    s.on("presence:update", p => setOnline(v => ({ ...v, [p.userId]: p.online })));
    s.on("message:new", m => {
      setChats(prev => prev.map(c => String(c._id) === String(m.conversation) ? { ...c, lastMessage: m, lastActivity: m.createdAt, unreadCount: c._id === active?._id ? 0 : (c.unreadCount || 0) + 1 } : c).sort((a,b) => new Date(b.lastActivity)-new Date(a.lastActivity)));
      if (String(m.conversation) === String(active?._id)) {
        setMessages(prev => prev.some(x => x._id === m._id) ? prev : [...prev, m]);
        api.post(`/messages/${m.conversation}/read`).catch(()=>{});
      }
    });
    s.on("typing", p => { if (String(p.conversationId) === String(active?._id)) setTyping(p.isTyping); });
    s.on("message:read", p => {
      if (String(p.conversationId) === String(active?._id)) setMessages(prev => prev.map(m => m.sender?._id === me._id ? { ...m, readBy: [...(m.readBy || []), p.userId] } : m));
    });
    return () => s.disconnect();
  }, [token, me, active?._id]);

  useEffect(() => {
    if (!active || !socketRef.current) return;
    socketRef.current.emit("conversation:join", active._id);
    setMessages([]); setOlder(true);
    api.get(`/messages/${active._id}`).then(r => { setMessages(r.data.messages); setOlder(r.data.hasMore); api.post(`/messages/${active._id}/read`).catch(()=>{}); })
      .catch(e => setError(e.response?.data?.message || "Could not load messages"));
    setChats(prev => prev.map(c => c._id === active._id ? { ...c, unreadCount: 0 } : c));
  }, [active?._id]);

  useEffect(() => { bottom.current?.scrollIntoView({ behavior: "smooth" }); }, [messages, typing]);

  async function authenticate(e) {
    e.preventDefault(); setError("");
    try {
      const path = mode === "register" ? "/auth/register" : "/auth/login";
      const r = await api.post(path, form);
      localStorage.setItem("chat_token", r.data.token); setToken(r.data.token); setMe(r.data.user);
    } catch (e) { setError(e.response?.data?.message || "Authentication failed"); }
  }
  function logout() { localStorage.removeItem("chat_token"); setToken(null); setMe(null); setChats([]); setActive(null); }
  async function findUsers(value) {
    setSearch(value);
    if (value.trim().length < 2) { setResults([]); return; }
    try { const r = await api.get(`/users/search?q=${encodeURIComponent(value)}`); setResults(r.data.users); } catch {}
  }
  async function startChat(user) {
    try {
      const r = await api.post("/conversations/direct", { userId: user._id });
      const chat = r.data.conversation;
      const list = await api.get("/conversations"); setChats(list.data.conversations);
      setActive(chat); setSearch(""); setResults([]); setMobileChat(true);
    } catch (e) { setError(e.response?.data?.message || "Could not start chat"); }
  }
  async function sendMessage(file) {
    if ((!text.trim() && !file) || !active) return;
    const body = new FormData(); body.append("text", text); if (file) body.append("file", file);
    setText(""); setShowEmoji(false);
    try {
      const r = await api.post(`/messages/${active._id}`, body, { headers: { "Content-Type": "multipart/form-data" } });
      setMessages(prev => prev.some(m => m._id === r.data.message._id) ? prev : [...prev, r.data.message]);
      setChats(prev => prev.map(c => c._id === active._id ? { ...c, lastMessage: r.data.message, lastActivity: r.data.message.createdAt } : c));
    } catch (e) { setError(e.response?.data?.message || "Message failed to send"); }
  }
  function changeText(v) {
    setText(v);
    if (!active || !socketRef.current) return;
    socketRef.current.emit("typing", { conversationId: active._id, isTyping: true });
    clearTimeout(typingTimer.current);
    typingTimer.current = setTimeout(() => socketRef.current?.emit("typing", { conversationId: active._id, isTyping: false }), 900);
  }
  async function loadOlder() {
    if (!older || !messages.length || !active) return;
    const first = messages[0];
    const r = await api.get(`/messages/${active._id}?before=${encodeURIComponent(first.createdAt)}`);
    setMessages(prev => [...r.data.messages, ...prev]); setOlder(r.data.hasMore);
  }

  if (!token || !me) return <div className="auth-screen">
    <form className="auth-card" onSubmit={authenticate}>
      <div className="brand-mark"><MessageCircle size={25}/></div><h1>Pulse<span>Chat</span></h1>
      <p className="muted">A little closer, in real time.</p>
      <div className="switch"><button type="button" className={mode==="login"?"selected":""} onClick={()=>setMode("login")}>Log in</button><button type="button" className={mode==="register"?"selected":""} onClick={()=>setMode("register")}>Create account</button></div>
      {mode==="register" && <input required minLength="3" placeholder="Username (3–24 characters)" value={form.username} onChange={e=>setForm({...form,username:e.target.value})}/>}
      <input required type="email" placeholder="Email address" value={form.email} onChange={e=>setForm({...form,email:e.target.value})}/>
      <input required minLength="8" type="password" placeholder="Password (at least 8 characters)" value={form.password} onChange={e=>setForm({...form,password:e.target.value})}/>
      {error && <p className="error">{error}</p>}<button className="primary full">{mode==="login"?"Log in":"Create account"}</button>
      <p className="tiny muted">Your messages are stored in your configured MongoDB database.</p>
    </form>
  </div>;

  return <main className={dark ? "app dark" : "app light"}>
    <aside className={`sidebar ${mobileChat ? "hide-mobile" : ""}`}>
      <header className="side-head"><div className="brand"><div className="brand-mark"><MessageCircle size={21}/></div><b>Pulse<span>Chat</span></b></div><div className="head-actions"><button title="Toggle theme" onClick={()=>setDark(!dark)}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><button title="Log out" onClick={logout}><LogOut size={18}/></button></div></header>
      <div className="profile"><div className="avatar">{me.username[0].toUpperCase()}</div><div className="profile-info"><b>{me.username}</b><small><i className="online-dot"/> Online</small></div></div>
      <div className="search-wrap"><Search size={17}/><input placeholder="Search people..." value={search} onChange={e=>findUsers(e.target.value)}/>{search && <button onClick={()=>{setSearch("");setResults([])}}><X size={15}/></button>}</div>
      {results.length>0 && <div className="search-results"><small>PEOPLE</small>{results.map(u=><button key={u._id} onClick={()=>startChat(u)}><div className="avatar small">{u.username[0].toUpperCase()}</div><span>{u.username}</span><Plus size={16}/></button>)}</div>}
      <div className="section-title">MESSAGES <span>{chats.length}</span></div>
      <div className="chat-list">{chats.map(c=>{
        const other=c.members?.find(m=>m._id!==me._id); const name=c.isGroup?c.name:(other?.username||"Chat");
        return <button key={c._id} className={`chat-row ${active?._id===c._id?"active":""}`} onClick={()=>{setActive(c);setMobileChat(true)}}>
          <div className="avatar-wrap"><div className="avatar">{name[0]?.toUpperCase()}</div>{online[other?._id]&&<i className="online-dot status-dot"/>}</div>
          <div className="chat-meta"><div className="chat-line"><b>{name}</b><time>{c.lastActivity?day(c.lastActivity):""}</time></div><div className="chat-line"><p>{c.lastMessage?.text || c.lastMessage?.attachment?.originalName || "Start a conversation"}</p>{c.unreadCount>0&&<span className="unread">{c.unreadCount}</span>}</div></div>
        </button>;
      })}{chats.length===0&&<div className="empty-list">No chats yet.<br/>Search a username to begin.</div>}</div>
      <div className="sidebar-foot"><span>Connected to PulseChat</span><i className="online-dot"/></div>
    </aside>
    <section className={`conversation ${!mobileChat?"hide-mobile":""}`}>
      {!active ? <div className="welcome"><div className="welcome-icon"><MessageCircle size={36}/></div><h2>Your conversations, together.</h2><p>Choose a chat or search for someone to start a conversation.</p></div> : <>
        <header className="chat-header"><button className="back-btn" onClick={()=>setMobileChat(false)}><ArrowLeft/></button><div className="avatar">{(title||"?")[0].toUpperCase()}</div><div className="header-person"><b>{title}</b><small>{typing?"typing…":online[activeOther?._id]?"Active now":activeOther?.lastSeen?`Last seen ${stamp(activeOther.lastSeen)}`:"Offline"}</small></div><div className="header-spacer"/><span className="secure-label">● Live chat</span></header>
        <div className="messages" ref={listRef}>
          {older&&messages.length>=30&&<button className="load-older" onClick={loadOlder}>Load older messages</button>}
          {messages.map((m,i)=>{
            const mine=m.sender?._id===me._id;
            return <div key={m._id||i} className={`message-row ${mine?"mine":""}`}><div className="bubble"><div className="sender">{mine?"You":m.sender?.username}</div>{m.text&&<p>{m.text}</p>}{m.attachment&&<a className="attachment" href={`${API}${m.attachment.url}`} target="_blank" rel="noreferrer">{m.attachment.mimeType?.startsWith("image/")?<img src={`${API}${m.attachment.url}`} alt={m.attachment.originalName}/>:<Paperclip size={18}/>}<span>{m.attachment.originalName}</span></a>}<div className="message-time">{stamp(m.createdAt)} {mine&&(m.readBy?.length>1?<CheckCheck size={14} className="read-check"/>:<Check size={14}/>)}</div></div></div>;
          })}
          {typing&&<div className="typing-bubble"><span/><span/><span/></div>}<div ref={bottom}/>
        </div>
        <form className="composer" onSubmit={e=>{e.preventDefault();sendMessage()}}>
          {showEmoji&&<div className="emoji-pop"><EmojiPicker onEmojiClick={e=>setText(t=>t+e.emoji)} theme={dark?"dark":"light"} height={350}/></div>}
          <button type="button" className="icon-btn" title="Attach file" onClick={()=>fileRef.current?.click()}><Paperclip size={20}/></button><input ref={fileRef} type="file" hidden onChange={e=>{if(e.target.files?.[0])sendMessage(e.target.files[0]);e.target.value=""}}/>
          <button type="button" className="icon-btn" title="Emoji" onClick={()=>setShowEmoji(!showEmoji)}><Smile size={20}/></button>
          <input className="message-input" value={text} onChange={e=>changeText(e.target.value)} placeholder={`Message ${title||""}...`} maxLength={5000}/>
          <button className="send-btn" disabled={!text.trim()}><Send size={18}/></button>
        </form>
      </>}
    </section>
    {error&&<div className="toast" onClick={()=>setError("")}>{error} <X size={14}/></div>}
  </main>;
}
