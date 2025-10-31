import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Atlas connection
const MONGODB_URI = process.env.MONGODB_URI ;
let db = null;

async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db("vmnc");
    console.log("✅ Connected to MongoDB Atlas");
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
  }
}

connectDB();

// Simple admin auth
const requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token === 'admin123') next();
  else res.status(401).json({ error: 'Unauthorized' });
};

// Get all data
app.get("/api/data", async (req, res) => {
  try {
    const [players, teams, tournaments, giveaways] = await Promise.all([
      db.collection('players').find({}).toArray(),
      db.collection('teams').find({}).toArray(),
      db.collection('tournaments').find({}).toArray(),
      db.collection('giveaways').find({}).toArray()
    ]);

    res.json({ players, teams, tournaments, giveaways });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Get individual collections
app.get("/api/players", async (req, res) => {
  const players = await db.collection('players').find({}).toArray();
  res.json(players);
});

app.get("/api/teams", async (req, res) => {
  const teams = await db.collection('teams').find({}).toArray();
  res.json(teams);
});

app.get("/api/tournaments", async (req, res) => {
  const tournaments = await db.collection('tournaments').find({}).toArray();
  res.json(tournaments);
});

app.get("/api/giveaways", async (req, res) => {
  const giveaways = await db.collection('giveaways').find({}).toArray();
  res.json(giveaways);
});

// Health check
app.get("/api/health", async (req, res) => {
  const counts = await Promise.all([
    db.collection('players').countDocuments(),
    db.collection('teams').countDocuments(),
    db.collection('tournaments').countDocuments(),
    db.collection('giveaways').countDocuments()
  ]);
  
  res.json({ 
    status: "ok", 
    database: "mongodb",
    data: {
      players: counts[0],
      teams: counts[1],
      tournaments: counts[2],
      giveaways: counts[3]
    }
  });
});

// ADMIN ROUTES

// Admin login endpoint
app.post("/api/admin/login", (req, res) => {
  const { password } = req.body;
  
  // Simple password check
  if (password === 'admin123') {
    const token = 'admin123'; // Simple token
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

// Get admin data
app.get("/api/admin/data", requireAdmin, async (req, res) => {
  const [players, teams, tournaments, giveaways] = await Promise.all([
    db.collection('players').find({}).toArray(),
    db.collection('teams').find({}).toArray(),
    db.collection('tournaments').find({}).toArray(),
    db.collection('giveaways').find({}).toArray()
  ]);
  res.json({ players, teams, tournaments, giveaways });
});

// Update collection data
app.post("/api/admin/update", requireAdmin, async (req, res) => {
  const { type, data } = req.body;
  
  try {
    // Clear and replace the entire collection
    await db.collection(type).deleteMany({});
    
    if (data.length > 0) {
      // Add _id to each item if not present
      const processedData = data.map(item => ({
        ...item,
        _id: item._id || new ObjectId()
      }));
      
      await db.collection(type).insertMany(processedData);
    }
    
    res.json({ 
      success: true, 
      message: `${type} updated successfully`,
      count: data.length 
    });
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      message: 'Error updating data' 
    });
  }
});

// Create new item
app.post("/api/admin/:collection", requireAdmin, async (req, res) => {
  const { collection } = req.params;
  const data = { ...req.body, _id: new ObjectId() };
  await db.collection(collection).insertOne(data);
  res.json({ success: true, id: data._id });
});

app.put("/api/admin/:collection/:id", requireAdmin, async (req, res) => {
  const { collection, id } = req.params;
  await db.collection(collection).updateOne(
    { _id: new ObjectId(id) },
    { $set: req.body }
  );
  res.json({ success: true });
});

app.delete("/api/admin/:collection/:id", requireAdmin, async (req, res) => {
  const { collection, id } = req.params;
  await db.collection(collection).deleteOne({ _id: new ObjectId(id) });
  res.json({ success: true });
});
// 🟢 Keep-alive route for uptime monitoring
app.get("/ping", (req, res) => res.send("pong"));

app.get("/", (req, res) => {
  res.send(`
    <h1>🎯 VMNC Esports API</h1>
    <p>Server is running fine 🚀</p>
    <p>Use <a href="/ping">/ping</a> to test uptime monitoring.</p>
  `);
});

// Let Render assign the port automatically
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 MongoDB: ${process.env.MONGODB_URI ? 'Environment' : 'Default'}`);
});
