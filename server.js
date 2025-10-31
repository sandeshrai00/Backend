import express from "express";
import fs from "fs";
import cors from "cors";

const app = express();
app.use(cors());
app.use(express.json());

// Read your database JSON
let db = JSON.parse(fs.readFileSync("./db.json"));

// GET endpoint to send all data
app.get("/api/data", (req, res) => {
  res.json(db);
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
