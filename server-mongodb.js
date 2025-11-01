import express from "express";
import { MongoClient, ObjectId } from "mongodb";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// MongoDB Atlas connection
const MONGODB_URI = process.env.MONGODB_URI;
let db = null;

async function connectDB() {
  try {
    const client = new MongoClient(MONGODB_URI);
    await client.connect();
    db = client.db("vmnc");
    console.log("✅ Connected to MongoDB Atlas");
    
    // Create indexes for better performance
    await db.collection('liveMatches').createIndex({ status: 1 });
    await db.collection('upcomingMatches').createIndex({ date: 1 });
    await db.collection('tournaments').createIndex({ status: 1 });
    await db.collection('verificationRequests').createIndex({ discord_id: 1 });
    await db.collection('verificationRequests').createIndex({ status: 1 });
    
  } catch (error) {
    console.error("❌ MongoDB connection error:", error);
    process.exit(1); // Exit if DB connection fails
  }
}

connectDB();

// Simple admin auth
const requireAdmin = (req, res, next) => {
  const token = req.headers.authorization?.replace('Bearer ', '');
  if (token === 'admin123') next();
  else res.status(401).json({ error: 'Unauthorized' });
};

// Add database connection middleware
app.use((req, res, next) => {
  if (!db) {
    return res.status(503).json({ error: "Database not connected" });
  }
  next();
});

// Get all data
app.get("/api/data", async (req, res) => {
  try {
    const [players, teams, tournaments, giveaways, liveMatches, upcomingMatches, verificationRequests] = await Promise.all([
      db.collection('players').find({}).toArray(),
      db.collection('teams').find({}).toArray(),
      db.collection('tournaments').find({}).toArray(),
      db.collection('giveaways').find({}).toArray(),
      db.collection('liveMatches').find({}).toArray(),
      db.collection('upcomingMatches').find({}).toArray(),
      db.collection('verificationRequests').find({}).toArray()
    ]);

    res.json({ players, teams, tournaments, giveaways, liveMatches, upcomingMatches, verificationRequests });
  } catch (error) {
    console.error("Data fetch error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// Get individual collections
app.get("/api/players", async (req, res) => {
  try {
    const players = await db.collection('players').find({}).toArray();
    res.json(players);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/teams", async (req, res) => {
  try {
    const teams = await db.collection('teams').find({}).toArray();
    res.json(teams);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/tournaments", async (req, res) => {
  try {
    const tournaments = await db.collection('tournaments').find({}).toArray();
    res.json(tournaments);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

app.get("/api/giveaways", async (req, res) => {
  try {
    const giveaways = await db.collection('giveaways').find({}).toArray();
    res.json(giveaways);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// VERIFICATION REQUESTS ROUTES
app.post("/api/verification-requests", async (req, res) => {
  try {
    const { discord_username, discord_id, email, status, requested_at } = req.body;
    
    // Check if user already has a pending request
    const existingRequest = await db.collection('verificationRequests').findOne({
      discord_id,
      status: 'pending'
    });
    
    if (existingRequest) {
      return res.status(400).json({ 
        success: false, 
        message: 'You already have a pending verification request' 
      });
    }
    
    const verificationRequest = {
      _id: new ObjectId(),
      discord_username,
      discord_id,
      email,
      status: status || 'pending',
      requested_at: requested_at || new Date().toISOString(),
      reviewed: false,
      reviewed_by: null,
      reviewed_at: null
    };
    
    await db.collection('verificationRequests').insertOne(verificationRequest);
    
    res.json({ 
      success: true, 
      message: 'Verification request submitted successfully',
      request_id: verificationRequest._id 
    });
  } catch (error) {
    console.error('Verification request error:', error);
    res.status(500).json({ success: false, message: 'Error submitting verification request' });
  }
});

// Get all verification requests (admin only)
app.get("/api/verification-requests", requireAdmin, async (req, res) => {
  try {
    const requests = await db.collection('verificationRequests')
      .find({})
      .sort({ requested_at: -1 })
      .toArray();
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Get user's own verification requests
app.get("/api/verification-requests/user/:discord_id", async (req, res) => {
  try {
    const { discord_id } = req.params;
    
    const requests = await db.collection('verificationRequests')
      .find({ discord_id })
      .sort({ requested_at: -1 })
      .toArray();
    
    res.json(requests);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Update verification request status (admin only)
app.put("/api/verification-requests/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, reviewed_by } = req.body;
    
    const result = await db.collection('verificationRequests').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          status,
          reviewed: true,
          reviewed_by,
          reviewed_at: new Date().toISOString()
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Verification request not found' });
    }
    
    res.json({ success: true, message: 'Verification request updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating request' });
  }
});

// Delete verification request (admin only)
app.delete("/api/verification-requests/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.collection('verificationRequests').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Verification request not found' });
    }
    
    res.json({ success: true, message: 'Verification request deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting request' });
  }
});

// LIVE MATCHES ROUTES
app.get("/api/live-matches", async (req, res) => {
  try {
    const [liveMatches, upcomingMatches] = await Promise.all([
      db.collection('liveMatches').find({}).sort({ _id: -1 }).toArray(),
      db.collection('upcomingMatches').find({}).sort({ date: 1 }).toArray()
    ]);
    res.json({ liveMatches, upcomingMatches });
  } catch (error) {
    console.error("Live matches fetch error:", error);
    res.status(500).json({ error: "Database error" });
  }
});

// Get only live matches
app.get("/api/live-matches/current", async (req, res) => {
  try {
    const liveMatches = await db.collection('liveMatches')
      .find({ status: "LIVE" })
      .sort({ _id: -1 })
      .toArray();
    res.json(liveMatches);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Get only upcoming matches
app.get("/api/upcoming-matches", async (req, res) => {
  try {
    const upcomingMatches = await db.collection('upcomingMatches')
      .find({ date: { $gte: new Date().toISOString() } })
      .sort({ date: 1 })
      .toArray();
    res.json(upcomingMatches);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Health check
app.get("/api/health", async (req, res) => {
  try {
    const counts = await Promise.all([
      db.collection('players').countDocuments(),
      db.collection('teams').countDocuments(),
      db.collection('tournaments').countDocuments(),
      db.collection('giveaways').countDocuments(),
      db.collection('liveMatches').countDocuments(),
      db.collection('upcomingMatches').countDocuments(),
      db.collection('verificationRequests').countDocuments()
    ]);
    
    res.json({ 
      status: "ok", 
      database: "mongodb",
      data: {
        players: counts[0],
        teams: counts[1],
        tournaments: counts[2],
        giveaways: counts[3],
        liveMatches: counts[4],
        upcomingMatches: counts[5],
        verificationRequests: counts[6]
      }
    });
  } catch (error) {
    res.status(500).json({ status: "error", database: "disconnected" });
  }
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
  try {
    const [players, teams, tournaments, giveaways, liveMatches, upcomingMatches, verificationRequests] = await Promise.all([
      db.collection('players').find({}).toArray(),
      db.collection('teams').find({}).toArray(),
      db.collection('tournaments').find({}).toArray(),
      db.collection('giveaways').find({}).toArray(),
      db.collection('liveMatches').find({}).toArray(),
      db.collection('upcomingMatches').find({}).toArray(),
      db.collection('verificationRequests').find({}).toArray()
    ]);
    res.json({ players, teams, tournaments, giveaways, liveMatches, upcomingMatches, verificationRequests });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Update collection data
app.post("/api/admin/update", requireAdmin, async (req, res) => {
  const { type, data } = req.body;
  
  try {
    // Validate collection name
    const validCollections = ['players', 'teams', 'tournaments', 'giveaways', 'liveMatches', 'upcomingMatches', 'verificationRequests'];
    if (!validCollections.includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid collection type' 
      });
    }

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
    console.error("Update error:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating data' 
    });
  }
});

// Create new item
app.post("/api/admin/:collection", requireAdmin, async (req, res) => {
  const { collection } = req.params;
  
  try {
    const data = { ...req.body, _id: new ObjectId() };
    await db.collection(collection).insertOne(data);
    res.json({ success: true, id: data._id });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error creating item' });
  }
});

app.put("/api/admin/:collection/:id", requireAdmin, async (req, res) => {
  const { collection, id } = req.params;
  
  try {
    const result = await db.collection(collection).updateOne(
      { _id: new ObjectId(id) },
      { $set: req.body }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating item' });
  }
});

app.delete("/api/admin/:collection/:id", requireAdmin, async (req, res) => {
  const { collection, id } = req.params;
  
  try {
    const result = await db.collection(collection).deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Item not found' });
    }
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting item' });
  }
});

// Live matches specific admin routes
app.get("/api/admin/live-matches", requireAdmin, async (req, res) => {
  try {
    const [liveMatches, upcomingMatches] = await Promise.all([
      db.collection('liveMatches').find({}).toArray(),
      db.collection('upcomingMatches').find({}).toArray()
    ]);
    res.json({ liveMatches, upcomingMatches });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

app.post("/api/admin/live-matches/update", requireAdmin, async (req, res) => {
  const { type, data } = req.body; // type: 'liveMatches' or 'upcomingMatches'
  
  try {
    if (!['liveMatches', 'upcomingMatches'].includes(type)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Invalid type. Must be liveMatches or upcomingMatches' 
      });
    }

    await db.collection(type).deleteMany({});
    
    if (data.length > 0) {
      const processedData = data.map(item => ({
        ...item,
        _id: item._id || new ObjectId(),
        // Ensure dates are properly formatted
        ...(type === 'upcomingMatches' && item.date && { date: new Date(item.date).toISOString() })
      }));
      
      await db.collection(type).insertMany(processedData);
    }
    
    res.json({ 
      success: true, 
      message: `${type} updated successfully`,
      count: data.length 
    });
  } catch (error) {
    console.error("Live matches update error:", error);
    res.status(500).json({ 
      success: false, 
      message: 'Error updating live matches' 
    });
  }
});

// 🟢 Keep-alive route for uptime monitoring
app.get("/ping", (req, res) => res.send("pong"));

app.get("/", (req, res) => {
  res.send(`
    <h1>🎯 VMNC Esports API</h1>
    <p>Server is running fine 🚀</p>
    <p>Use <a href="/ping">/ping</a> to test uptime monitoring.</p>
    <p>Available endpoints:</p>
    <ul>
      <li><a href="/api/health">/api/health</a> - Health check</li>
      <li><a href="/api/data">/api/data</a> - All data</li>
      <li><a href="/api/live-matches">/api/live-matches</a> - Live matches</li>
      <li><a href="/api/players">/api/players</a> - Players</li>
      <li><a href="/api/teams">/api/teams</a> - Teams</li>
      <li><a href="/api/tournaments">/api/tournaments</a> - Tournaments</li>
      <li><a href="/api/giveaways">/api/giveaways</a> - Giveaways</li>
      <li><a href="/api/verification-requests">/api/verification-requests</a> - Verification Requests (Admin)</li>
    </ul>
  `);
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error('Unhandled error:', error);
  res.status(500).json({ error: 'Internal server error' });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

// Let Render assign the port automatically
const PORT = process.env.PORT || 10000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📊 MongoDB: ${process.env.MONGODB_URI ? 'Environment' : 'Default'}`);
  console.log(`🌐 API Base URL: http://localhost:${PORT}`);
});
