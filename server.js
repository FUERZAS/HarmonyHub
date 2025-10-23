import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();
const app = express();
const PORT = process.env.PORT || 5001;

// Middleware
app.use(cors());
app.use(express.json());

// ✅ Path helpers for serving static files
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ✅ Serve static files (admin folder + root)
app.use(express.static(path.join(__dirname, "admin")));
app.use(express.static(__dirname)); 

// Gemini setup
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-flash-latest" });

// Routes
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "index.html")); // show homepage
});

app.post("/chat", async (req, res) => {
  try {
    const userMessage = req.body.message;
    const result = await model.generateContent(userMessage);

    // Safely extract text
    const reply =
      result?.response?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "⚠️ No reply from Gemini.";
    
    res.json({ reply });
  } catch (error) {
    console.error("Gemini API Error:", error);
    res.status(500).json({ error: "Error connecting to Gemini", details: error.message });
  }
});

app.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
  console.log(`📁 Open AI Assistant: http://localhost:${PORT}/assist.html`);
});
