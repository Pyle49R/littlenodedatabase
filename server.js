import express from "express";
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";

// Setup Express app
const app = express();
app.use(express.json()); // for parsing JSON request bodies

// Setup LowDB
const adapter = new JSONFile("db.json");
const db = new Low(adapter);

// Initialize the database
await db.read();
db.data ||= { requests: [] };
await db.write();

// Route to store data
app.post("/store", async (req, res) => {
  const { data } = req.body;
  if (!data) return res.status(400).json({ error: "No data provided" });

  db.data.requests.push({ data, timestamp: new Date().toISOString() });
  await db.write();
  res.json({ success: true, stored: data });
});

// Route to fetch all stored data
app.get("/data", async (req, res) => {
  await db.read();
  res.json(db.data.requests);
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
