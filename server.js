import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Simple in-memory admin sessions (for demo - use Redis in production)
const adminSessions = new Map();

// Read your database JSON
let db = JSON.parse(fs.readFileSync("./db.json"));

// Simple admin authentication middleware
const requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token || !adminSessions.has(token)) {
    return res.status(401).json({ error: 'Unauthorized - Admin access required' });
  }
  
  next();
};

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

// Admin login endpoint
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  
  // In production, use proper password hashing and environment variables
  const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin123';
  
  if (password === ADMIN_PASSWORD) {
    const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
    adminSessions.set(token, { 
      loggedInAt: new Date().toISOString(),
      expiresAt: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
    });
    
    res.json({ 
      success: true, 
      token,
      message: 'Login successful'
    });
  } else {
    res.status(401).json({ 
      success: false, 
      message: 'Invalid password' 
    });
  }
});

// Admin logout endpoint
app.post("/api/admin/logout", requireAdmin, (req, res) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  adminSessions.delete(token);
  res.json({ success: true, message: 'Logged out successfully' });
});

// GET admin data (protected)
app.get("/api/admin/data", requireAdmin, (req, res) => {
  res.json(db);
});

// POST endpoint to update data (protected)
app.post("/api/admin/update", requireAdmin, (req, res) => {
  const { type, data } = req.body;
  
  if (!db.hasOwnProperty(type)) {
    return res.status(400).json({ 
      success: false, 
      message: `Invalid data type: ${type}` 
    });
  }
  
  db[type] = data;
  
  try {
    fs.writeFileSync("./db.json", JSON.stringify(db, null, 2));
    res.json({ 
      success: true, 
      message: `${type} updated successfully`,
      count: data.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error writing to database' 
    });
  }
});

// Individual update endpoints (protected)
app.put("/api/admin/players/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  const updatedPlayer = req.body;
  
  const playerIndex = db.players.findIndex(p => p.id === id);
  if (playerIndex === -1) {
    return res.status(404).json({ error: 'Player not found' });
  }
  
  db.players[playerIndex] = { ...db.players[playerIndex], ...updatedPlayer };
  fs.writeFileSync("./db.json", JSON.stringify(db, null, 2));
  
  res.json({ success: true, player: db.players[playerIndex] });
});

app.post("/api/admin/players", requireAdmin, (req, res) => {
  const newPlayer = {
    id: Date.now().toString(),
    ...req.body,
    created_at: new Date().toISOString()
  };
  
  db.players.push(newPlayer);
  fs.writeFileSync("./db.json", JSON.stringify(db, null, 2));
  
  res.json({ success: true, player: newPlayer });
});

app.delete("/api/admin/players/:id", requireAdmin, (req, res) => {
  const { id } = req.params;
  
  db.players = db.players.filter(p => p.id !== id);
  fs.writeFileSync("./db.json", JSON.stringify(db, null, 2));
  
  res.json({ success: true, message: 'Player deleted' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
