import express, { Request, Response } from "express";
import cors from "cors";
import { WebSocketServer, WebSocket } from "ws";

const app = express();
app.use(cors());
app.use(express.json());

const PORT = Number(process.env.PORT ?? 3000);

// --- Who is who ---
type Who = "me" | "gf";

function parseWho(v: unknown): Who | null {
  return v === "me" || v === "gf" ? v : null;
}

function other(who: Who): Who {
  return who === "me" ? "gf" : "me";
}

// --- Storage in memory (MVP) ---
const expoTokens: Record<Who, string | null> = { me: null, gf: null };
const sockets: Record<Who, WebSocket | null> = { me: null, gf: null };

// --- Expo push helper (Expo Push API) ---
async function sendExpoPush(
  toExpoToken: string,
  title: string,
  body: string,
  data: Record<string, unknown>
): Promise<boolean> {
  const payload = {
    to: toExpoToken,
    title,
    body,
    data,
    sound: "default",
    priority: "high",
  };

  const resp = await fetch("https://exp.host/--/api/v2/push/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  return resp.ok;
}

// --- 1) Register expo token ---
app.post("/register", (req: Request, res: Response) => {
  const who = parseWho(req.query.who);
  const token = typeof req.body?.expoPushToken === "string" ? req.body.expoPushToken : null;

  if (!who) return res.status(400).json({ error: "Query who must be 'me' or 'gf'" });
  if (!token) return res.status(400).json({ error: "Body expoPushToken is required" });

  expoTokens[who] = token;
  return res.json({ ok: true, who });
});

// --- 2) Send tap event to the other person ---
app.post("/tap", async (req: Request, res: Response) => {
  const from = parseWho(req.query.from);
  const x = req.body?.x;
  const y = req.body?.y;

  if (!from) return res.status(400).json({ error: "Query from must be 'me' or 'gf'" });
  if (typeof x !== "number" || typeof y !== "number") {
    return res.status(400).json({ error: "Body must contain numeric x and y" });
  }
  if (x < 0 || x > 1 || y < 0 || y > 1) {
    return res.status(400).json({ error: "x,y must be normalized in [0..1]" });
  }

  const to = other(from);

  const event = {
    type: "tap",
    from,
    to,
    x,
    y,
    ts: Date.now(),
  };

  // Realtime (if receiver is connected via WS)
  const ws = sockets[to];
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(event));
  }

  // Push notification (if token known)
  const token = expoTokens[to];
  if (token) {
    await sendExpoPush(token, "💖", `${from == "me" ? "Maksim" : "Diyara"} is missing you`, event);
  }

  return res.json({ ok: true });
});

// --- Debug endpoint (optional) ---
app.get("/status", (_req, res) => {
  res.json({
    tokens: { me: !!expoTokens.me, gf: !!expoTokens.gf },
    ws: { me: !!sockets.me, gf: !!sockets.gf },
  });
});

// --- Start HTTP + WebSocket ---
const server = app.listen(PORT, () => console.log(`API on http://localhost:${PORT}`));
const wss = new WebSocketServer({ server });

wss.on("connection", (ws) => {
  // First message must be: { "type":"hello", "who":"me" } or "gf"
  ws.on("message", (raw) => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg?.type === "hello") {
        const who = parseWho(msg.who);
        if (!who) {
          ws.send(JSON.stringify({ type: "error", message: "who must be 'me' or 'gf'" }));
          return;
        }

        sockets[who] = ws;
        ws.send(JSON.stringify({ type: "hello_ok", who }));
        return;
      }
      ws.send(JSON.stringify({ type: "error", message: "unknown message" }));
    } catch {
      ws.send(JSON.stringify({ type: "error", message: "bad json" }));
    }
  });

  ws.on("close", () => {
    (["me", "gf"] as Who[]).forEach((w) => {
      if (sockets[w] === ws) sockets[w] = null;
    });
  });
});
