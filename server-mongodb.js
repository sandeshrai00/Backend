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
    await db.collection('tournamentRegistrations').createIndex({ tournamentId: 1 });
    await db.collection('tournamentRegistrations').createIndex({ userId: 1 });
    
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
    const [players, teams, tournaments, giveaways, liveMatches, upcomingMatches, tournamentRegistrations] = await Promise.all([
      db.collection('players').find({}).toArray(),
      db.collection('teams').find({}).toArray(),
      db.collection('tournaments').find({}).toArray(),
      db.collection('giveaways').find({}).toArray(),
      db.collection('liveMatches').find({}).toArray(),
      db.collection('upcomingMatches').find({}).toArray(),
      db.collection('tournamentRegistrations').find({}).toArray()
    ]);

    res.json({ players, teams, tournaments, giveaways, liveMatches, upcomingMatches, tournamentRegistrations });
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

// TOURNAMENT REGISTRATION ROUTES
app.post("/api/tournament-registrations", async (req, res) => {
  try {
    console.log('📨 Received registration request:', req.body);
    
    const {
      tournamentId,
      tournamentTitle,
      userId,
      userEmail,
      discordUsername,
      teamName,
      teamMembers,
      captainDiscord,
      contactEmail,
      region,
      experience,
      status = 'pending'
    } = req.body;

    // Validate required fields
    if (!tournamentId || !teamName || !teamMembers || !captainDiscord) {
      console.log('❌ Missing required fields');
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: tournamentId, teamName, teamMembers, captainDiscord are required' 
      });
    }
    
    // Check if team name is already registered for this tournament
    const existingRegistration = await db.collection('tournamentRegistrations').findOne({
      tournamentId,
      teamName
    });
    
    if (existingRegistration) {
      console.log('❌ Team name already exists');
      return res.status(400).json({ 
        success: false, 
        message: 'Team name already registered for this tournament' 
      });
    }
    
    // Check if user already registered for this tournament
    const userExistingRegistration = await db.collection('tournamentRegistrations').findOne({
      tournamentId,
      userId
    });
    
    if (userExistingRegistration) {
      console.log('❌ User already registered');
      return res.status(400).json({ 
        success: false, 
        message: 'You have already registered a team for this tournament' 
      });
    }
    
    const registration = {
      _id: new ObjectId(),
      tournamentId,
      tournamentTitle,
      userId,
      userEmail,
      discordUsername,
      teamName,
      teamMembers: teamMembers.filter(member => member.trim() !== ''),
      captainDiscord,
      contactEmail,
      region,
      experience,
      status,
      registeredAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    
    console.log('💾 Saving registration to database');
    const result = await db.collection('tournamentRegistrations').insertOne(registration);
    console.log('✅ Registration saved with ID:', result.insertedId);
    
    // 🎮 Discord Webhook - Using global fetch (Node.js 18+)
    const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
    if (DISCORD_WEBHOOK_URL && typeof fetch !== 'undefined') {
      try {
        console.log('🤖 Attempting to send Discord webhook');
        const teamMembersList = teamMembers
          .filter(member => member.trim() !== '')
          .map((member, index) => `${index + 1}. ${member}`)
          .join('\n') || 'No members listed';

        const webhookData = {
          embeds: [
            {
              title: "🎮 New Tournament Registration",
              color: 0xff4655,
              fields: [
                { name: "🏆 Tournament", value: tournamentTitle, inline: true },
                { name: "👥 Team Name", value: teamName, inline: true },
                { name: "🎯 Region", value: region || "Not specified", inline: true },
                { name: "⭐ Captain", value: `${discordUsername}\n${captainDiscord}`, inline: true },
                { name: "📧 Contact", value: contactEmail || "Not provided", inline: true },
                { name: "📊 Experience", value: experience || "Not specified", inline: true },
                { name: "👥 Team Members", value: teamMembersList, inline: false },
              ],
              footer: { 
                text: `VMNC Esports • ${new Date().toLocaleDateString()}` 
              },
              timestamp: new Date().toISOString()
            },
          ],
        };

        const webhookResponse = await fetch(DISCORD_WEBHOOK_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(webhookData),
        });
        
        if (webhookResponse.ok) {
          console.log('✅ Discord webhook sent successfully');
        } else {
          console.warn('❌ Discord webhook failed with status:', webhookResponse.status);
        }
      } catch (webhookError) {
        console.error('❌ Discord webhook error:', webhookError.message);
        // Don't fail the registration if webhook fails
      }
    } else {
      console.log('ℹ️  Discord webhook not configured or fetch not available');
    }
    
    res.json({ 
      success: true, 
      message: 'Registration submitted successfully',
      registrationId: registration._id 
    });
    
  } catch (error) {
    console.error('💥 Tournament registration error:', error);
    res.status(500).json({ 
      success: false, 
      message: 'Error submitting registration: ' + error.message 
    });
  }
});

// Get registrations for a specific tournament
app.get("/api/tournament-registrations/:tournamentId", async (req, res) => {
  try {
    const { tournamentId } = req.params;
    const registrations = await db.collection('tournamentRegistrations')
      .find({ tournamentId })
      .sort({ registeredAt: -1 })
      .toArray();
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Get user's registrations
app.get("/api/user-registrations/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const registrations = await db.collection('tournamentRegistrations')
      .find({ userId })
      .sort({ registeredAt: -1 })
      .toArray();
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Get all registrations (admin only)
app.get("/api/tournament-registrations", requireAdmin, async (req, res) => {
  try {
    const registrations = await db.collection('tournamentRegistrations')
      .find({})
      .sort({ registeredAt: -1 })
      .toArray();
    res.json(registrations);
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Update registration status (admin only)
app.put("/api/tournament-registrations/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    
    const result = await db.collection('tournamentRegistrations').updateOne(
      { _id: new ObjectId(id) },
      { 
        $set: { 
          status,
          updatedAt: new Date().toISOString()
        } 
      }
    );
    
    if (result.matchedCount === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }
    
    res.json({ success: true, message: 'Registration status updated' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error updating registration' });
  }
});

// Delete registration (admin only)
app.delete("/api/tournament-registrations/:id", requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const result = await db.collection('tournamentRegistrations').deleteOne({ _id: new ObjectId(id) });
    
    if (result.deletedCount === 0) {
      return res.status(404).json({ success: false, message: 'Registration not found' });
    }
    
    res.json({ success: true, message: 'Registration deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Error deleting registration' });
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
      db.collection('tournamentRegistrations').countDocuments()
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
        tournamentRegistrations: counts[6]
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
    const token = 'admin123';
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
    const [players, teams, tournaments, giveaways, liveMatches, upcomingMatches, tournamentRegistrations] = await Promise.all([
      db.collection('players').find({}).toArray(),
      db.collection('teams').find({}).toArray(),
      db.collection('tournaments').find({}).toArray(),
      db.collection('giveaways').find({}).toArray(),
      db.collection('liveMatches').find({}).toArray(),
      db.collection('upcomingMatches').find({}).toArray(),
      db.collection('tournamentRegistrations').find({}).toArray()
    ]);
    res.json({ players, teams, tournaments, giveaways, liveMatches, upcomingMatches, tournamentRegistrations });
  } catch (error) {
    res.status(500).json({ error: "Database error" });
  }
});

// Update collection data
app.post("/api/admin/update", requireAdmin, async (req, res) => {
  const { type, data } = req.body;
  
  try {
    // Validate collection name
    const validCollections = ['players', 'teams', 'tournaments', 'giveaways', 'liveMatches', 'upcomingMatches', 'tournamentRegistrations'];
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
  const { type, data } = req.body;
  
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
      <li><a href="/api/tournament-registrations">/api/tournament-registrations</a> - Tournament Registrations</li>
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
  console.log(`🤖 Discord Webhook: ${process.env.DISCORD_WEBHOOK_URL ? 'Enabled' : 'Not configured'}`);
  console.log(`🔧 Node.js version: ${process.version}`);
});
