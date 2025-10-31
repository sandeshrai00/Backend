import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Read your database JSON
let db = JSON.parse(fs.readFileSync("./db.json"));

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.json({ 
    status: "ok", 
    timestamp: new Date().toISOString(),
    data: {
      players: db.players.length,
      teams: db.teams.length,
      tournaments: db.tournaments.length,
      giveaways: db.giveaways.length
    }
  });
});

// GET endpoint to send all data
app.get("/api/data", (req, res) => {
  res.json(db);
});

// Optional: Individual endpoints for each collection
app.get("/api/players", (req, res) => {
  res.json(db.players);
});

app.get("/api/teams", (req, res) => {
  res.json(db.teams);
});

app.get("/api/tournaments", (req, res) => {
  res.json(db.tournaments);
});

app.get("/api/giveaways", (req, res) => {
  res.json(db.giveaways);
});

// POST endpoint to update data (optional)
app.post("/api/update", (req, res) => {
  const { type, data } = req.body;
  db[type] = data;
  fs.writeFileSync("./db.json", JSON.stringify(db, null, 2));
  res.json({ success: true });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
