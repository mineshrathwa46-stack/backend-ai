require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");

const app = express();

const PORT = 5000;

app.use(cors());
app.use(express.json());

const upload = multer({
  dest: "uploads/",
});

// OpenRouter is OpenAI-compatible, so we just call its REST endpoint
// directly with fetch (built into Node 18+) instead of needing an SDK.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";

// Free vision-capable models on OpenRouter (checked live, Aug 2026).
// Free model availability changes often — if all of these ever 404/disappear,
// check https://openrouter.ai/models?fmt=cards&order=newest&max_price=0
// and filter by "Vision" capability, then update this list.
const MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "meta-llama/llama-3.2-11b-vision-instruct:free",
];

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "VisionAI Backend Running",
    provider: "OpenRouter",
  });
});

app.post(
  "/api/analyze",
  upload.single("image"),
  async (req, res) => {
    let filePath = null;

    try {
      if (!req.file) {
        return res.status(400).json({
          error: "Image is required",
        });
      }

      if (!OPENROUTER_API_KEY) {
        return res.status(500).json({
          error: "Missing OPENROUTER_API_KEY in .env",
        });
      }

      filePath = req.file.path;

      const question =
        req.body.question?.trim() ||
        "Briefly describe what you can see in this image.";

      const base64Image =
        fs.readFileSync(filePath).toString("base64");

      const dataUrl = `data:${req.file.mimetype};base64,${base64Image}`;

      const systemPrompt = `
You are VisionAI, a natural real-time visual assistant.

You are talking directly to the user through a camera.

IMPORTANT RULES:
- Never start your response with "This image shows".
- Never say "The image".
- Talk naturally as if you are looking through the user's camera.
- Answer the user's question directly.
- Keep responses short and conversational.
- Describe only things you can actually see.
- Do not invent information.
- If the user asks "What do you see?", directly describe the visible scene.
- If the user asks about an object, identify it directly.
- If something is unclear, say that it is unclear.
`.trim();

      const messages = [
        {
          role: "system",
          content: systemPrompt,
        },
        {
          role: "user",
          content: [
            {
              type: "text",
              text: question,
            },
            {
              type: "image_url",
              image_url: {
                url: dataUrl,
              },
            },
          ],
        },
      ];

      let data = null;
      let usedModel = null;
      let lastError = null;

      // Try each free model in order. Free models get pulled/renamed
      // often, and the shared free pool can be rate-limited or flaky
      // under load, so if one 404s, 429s, or the network hiccups,
      // fall through to the next model instead of failing outright.
      for (const model of MODELS) {
        try {
          const openRouterResponse = await fetch(OPENROUTER_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${OPENROUTER_API_KEY}`,
              // Optional but recommended by OpenRouter for free-tier routing/analytics:
              "HTTP-Referer": "http://localhost:5000",
              "X-Title": "VisionAI",
            },
            body: JSON.stringify({
              model,
              messages,
            }),
          });

          const json = await openRouterResponse.json();

          if (openRouterResponse.ok) {
            data = json;
            usedModel = model;
            console.log(`✅ Success with model: ${model}`);
            break;
          }

          console.error(`OPENROUTER ERROR (${model}):`, json);
          lastError = json;

          // 404 = model gone, 429 = rate limited -> try next model.
          // Anything else (e.g. bad API key), stop immediately.
          const status = openRouterResponse.status;
          if (status !== 404 && status !== 429) {
            console.log("response",openRouterResponse.status);
            return res.status(status).json({
              error: "AI analysis failed",
              details: json.error?.message || "Unknown OpenRouter error",
            });
          }
        } catch (networkError) {
          // Connection dropped / DNS blip / etc. Don't kill the whole
          // request over one flaky attempt — just try the next model.
          console.error(
            `NETWORK ERROR calling ${model}:`,
            networkError.message
          );
          lastError = { error: { message: networkError.message } };
        }
      }

      if (!data) {
        return res.status(502).json({
          error: "AI analysis failed",
          details:
            lastError?.error?.message ||
            "All free models are currently unavailable or rate-limited",
        });
      }

      const answer =
        data.choices?.[0]?.message?.content ||
        "I could not generate an answer.";

      res.json({
        success: true,
        provider: "OpenRouter",
        model: usedModel,
        answer,
      });

    } catch (error) {
      console.error("OPENROUTER ERROR:", error);

      res.status(500).json({
        error: "AI analysis failed",
        details:
          error.message ||
          "Unknown OpenRouter error",
      });

    } finally {
      if (filePath) {
        try {
          fs.unlinkSync(filePath);
        } catch {}
      }
    }
  }
);

app.listen(PORT, () => {
  console.log(
    `🚀 Backend running on http://localhost:${PORT}`
  );
});