import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { pipeline } from 'stream';
import { promisify } from 'util';
const streamPipeline = promisify(pipeline);

dotenv.config();
const app = express();
const PORT = Number(process.env.PORT) || 5001;

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

// Proxy endpoint to fetch PDFs (or other resources) server-side and stream them to the client.
// This helps bypass CORS and framing restrictions when needed.
app.get('/pdf-proxy', async (req, res) => {
  const target = req.query.url;
  if (!target) return res.status(400).send('Missing url parameter');
  try {
    const parsed = new URL(target);
    if (!['http:', 'https:'].includes(parsed.protocol)) return res.status(400).send('Invalid url protocol');
  } catch (e) {
    return res.status(400).send('Invalid url');
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    const upstream = await fetch(target, { signal: controller.signal });
    clearTimeout(timeout);
    if (!upstream.ok) {
      return res.status(upstream.status).send(`Upstream returned ${upstream.status}`);
    }

    let contentType = upstream.headers.get('content-type') || 'application/octet-stream';
    const contentLength = upstream.headers.get('content-length');

    // If the upstream content-type looks wrong but the URL ends with .pdf,
    // force applying PDF content-type so browsers and PDF.js treat it correctly.
    if (!/pdf/i.test(contentType) && req.query.url && req.query.url.toLowerCase().endsWith('.pdf')) {
      contentType = 'application/pdf';
    }

    // Set permissive headers so the browser can fetch/embed the response
    res.setHeader('Content-Type', contentType);
    // Suggest inline rendering and a sane filename so browsers open the PDF.
    try {
      const urlObj = new URL(req.query.url);
      const name = path.basename(urlObj.pathname) || 'document.pdf';
      res.setHeader('Content-Disposition', `inline; filename="${name}"`);
    } catch (e) {
      // ignore filename header if URL parsing fails
    }
    res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'public, max-age=3600');
    if (contentLength) res.setHeader('Content-Length', contentLength);

    // Stream the upstream response body to the client
    await streamPipeline(upstream.body, res);
  } catch (err) {
    if (err && err.name === 'AbortError') return res.status(504).send('Upstream timeout');
    console.error('pdf-proxy error:', err);
    return res.status(502).send('Failed to fetch upstream resource');
  }
});

function startServer(port, attemptsLeft = 5) {
  const server = app.listen(port, () => {
    console.log(`✅ Server running at http://localhost:${port}`);
    console.log(`📁 Open AI Assistant: http://localhost:${port}/assist.html`);
  });

  server.on('error', (err) => {
    if (err && err.code === 'EADDRINUSE' && attemptsLeft > 0) {
      console.warn(`Port ${port} in use, trying ${port + 1}...`);
      setTimeout(() => startServer(port + 1, attemptsLeft - 1), 200);
      return;
    }
    console.error('Server error:', err);
    process.exit(1);
  });
}

startServer(PORT, 10);
