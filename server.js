import express from "express";
import rateLimit from "express-rate-limit";
import helmet from "helmet";
import dotenv from "dotenv";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import path from "path";
import { fileURLToPath } from "url";
import crypto from "crypto";

dotenv.config();

// Paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Express setup
const app = express();
app.use(express.json({ limit: "10kb" }));
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100
});
app.use(limiter);

// API keys
const API_KEY = process.env.API_KEY;
const READONLY_API_KEY = process.env.READONLY_API_KEY;

if (!API_KEY || API_KEY.length < 20) {
    console.error("API_KEY missing or too short in .env!");
    process.exit(1);
}

if (!READONLY_API_KEY || READONLY_API_KEY.length < 10) {
    console.warn("READONLY_API_KEY missing or short — read-only access disabled");
}

//Authentication

// Allows admin OR readonly
function requireReadKey(req, res, next) {
    const key = req.headers["x-api-key"];

    if (!key) {
        return res.status(401).json({ error: "API key required" });
    }

    if (key === API_KEY) {
        req.apiRole = "admin";
        return next();
    }

    if (key === READONLY_API_KEY) {
        req.apiRole = "readonly";
        return next();
    }

    return res.status(401).json({ error: "Unauthorized" });
}

// Allows admin ONLY
function requireAdminKey(req, res, next) {
    const key = req.headers["x-api-key"];

    if (!key || key !== API_KEY) {
        return res.status(401).json({ error: "Admin API key required" });
    }

    req.apiRole = "admin";
    next();
}

// Database setup
const dbFile = path.join(__dirname, "db.json");
const adapter = new JSONFile(dbFile);
const db = new Low(adapter, { items: [] });

await db.read();
db.data ||= { items: [] };
await db.write();

//Routes for interacting

app.get("/", (req, res) => {
    res.json({ status: "ok, standby" });
});

// Create (Administrative)
app.post("/tx", requireAdminKey, async (req, res) => {
    const { name, value } = req.body;

    if (typeof name !== "string" || name.length < 1 || name.length > 100) {
        return res.status(400).json({ error: "Invalid name" });
    }

    if (typeof value !== "string" || value.length < 1 || value.length > 500) {
        return res.status(400).json({ error: "Invalid value" });
    }

    const item = {
        id: crypto.randomUUID(),
        name: name.trim(),
        value: value.trim(),
        time: Date.now()
    };

    db.data.items.push(item);
    await db.write();

    res.json({ success: true, item });
});

// Read All
app.get("/rx", requireReadKey, async (req, res) => {
    await db.read();
    res.json(db.data.items);
});

// Query
app.get("/rx/:name", requireReadKey, async (req, res) => {
    const { name } = req.params;

    await db.read();
    const results = db.data.items.filter(i => i.name === name);

    res.json(results);
});

// Update (Administrative)
app.put("/tx/:id", requireAdminKey, async (req, res) => {
    const { id } = req.params;
    const { name, value } = req.body;

    await db.read();
    const item = db.data.items.find(i => i.id === id);

    if (!item) {
        return res.status(404).json({ error: "Item not found" });
    }

    if (typeof name === "string" && name.length > 0 && name.length <= 100) {
        item.name = name.trim();
    }

    if (typeof value === "string" && value.length > 0 && value.length <= 500) {
        item.value = value.trim();
    }

    item.time = Date.now();
    await db.write();

    res.json({ success: true, item });
});

// Delete By ID (Administrative)
app.delete("/tx/:id", requireAdminKey, async (req, res) => {
    const { id } = req.params;

    await db.read();
    const index = db.data.items.findIndex(i => i.id === id);

    if (index === -1) {
        return res.status(404).json({ error: "Item not found" });
    }

    const removed = db.data.items.splice(index, 1)[0];
    await db.write();

    res.json({ success: true, removed });
});

// Delete All (Administrative)
app.delete("/tx", requireAdminKey, async (req, res) => {
    await db.read();
    const count = db.data.items.length;

    db.data.items = [];
    await db.write();

    res.json({ success: true, deletedCount: count });
});

// Start server & logging
const PORT = process.env.PORT || 3010;
app.listen(PORT, "127.0.0.1", () => {
    console.log(`Database server running on http://127.0.0.1:${PORT}`);
});
