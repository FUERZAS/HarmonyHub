import fetch from "node-fetch";
import dotenv from "dotenv";

dotenv.config();

const API_KEY = process.env.GEMINI_API_KEY;

async function listModels() {
  const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${API_KEY}`;

  try {
    const res = await fetch(url);
    const data = await res.json();

    if (data.models) {
      console.log("✅ Available models:");
      data.models.forEach((model) => {
        console.log(
          `- ${model.name} | methods: ${model.supportedGenerationMethods}`
        );
      });
    } else {
      console.log("⚠️ No models found or invalid API key response:", data);
    }
  } catch (err) {
    console.error("❌ Error fetching models:", err);
  }
}

listModels();
