require("dotenv").config();

const express = require("express");
const cors = require("cors");
const multer = require("multer");
const fs = require("fs");

const { adminAuth } = require("./config/firebaseAdmin");

const app = express();

const PORT = process.env.PORT || 5000;

// ======================================================
// MIDDLEWARE
// ======================================================

app.use(
  cors({
    origin: [
      "http://localhost:5173",
      "http://localhost:3000",
      "https://ai-chatbot-eta-five-22.vercel.app",
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

app.use(express.json());

// ======================================================
// UPLOAD
// ======================================================

const upload = multer({
  dest: "uploads/",
});

// ======================================================
// OPENROUTER
// ======================================================

const OPENROUTER_API_KEY =
  process.env.OPENROUTER_API_KEY;

const OPENROUTER_URL =
  "https://openrouter.ai/api/v1/chat/completions";

const MODELS = [
  "google/gemma-4-31b-it:free",
  "google/gemma-4-26b-a4b-it:free",
  "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning:free",
  "meta-llama/llama-3.2-11b-vision-instruct:free",
];

// ======================================================
// HOME
// ======================================================

app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "VisionAI Backend Running",
    provider: "OpenRouter",
    firebaseAuth: true,
  });
});

// ======================================================
// FIREBASE GOOGLE LOGIN
// ======================================================

app.post("/api/auth/google", async (req, res) => {
  try {
    const { id_token: idToken } = req.body;

    console.log("");
    console.log("=================================");
    console.log("🔐 GOOGLE LOGIN REQUEST");
    console.log("Token received:", !!idToken);
    console.log("=================================");

    // ----------------------------------------------
    // TOKEN CHECK
    // ----------------------------------------------

    if (!idToken) {
      return res.status(400).json({
        success: false,
        error: "Missing Firebase ID token",
      });
    }

    // ----------------------------------------------
    // VERIFY FIREBASE TOKEN
    // ----------------------------------------------

    const decodedToken =
      await adminAuth.verifyIdToken(idToken);

    console.log("✅ Firebase token verified");

    console.log({
      uid: decodedToken.uid,
      email: decodedToken.email,
      name: decodedToken.name,
    });

    // ----------------------------------------------
    // RESPONSE
    // ----------------------------------------------

    return res.status(200).json({
      success: true,
      message: "Google login successful",

      user: {
        id: decodedToken.uid,

        name:
          decodedToken.name ||
          decodedToken.email?.split("@")[0] ||
          "",

        email:
          decodedToken.email || "",

        picture:
          decodedToken.picture || "",

        email_verified:
          decodedToken.email_verified || false,
      },
    });

  } catch (error) {
    console.error("");
    console.error(
      "❌ FIREBASE GOOGLE AUTH FAILED"
    );
    console.error("Message:", error.message);
    console.error("Code:", error.code);
    console.error("");

    return res.status(401).json({
      success: false,
      error: "Firebase token verification failed",
      details: error.message,
    });
  }
});

// ======================================================
// AI IMAGE ANALYSIS
// ======================================================

app.post(
  "/api/analyze",
  upload.single("image"),

  async (req, res) => {
    let filePath = null;

    try {
      // ----------------------------------------------
      // IMAGE CHECK
      // ----------------------------------------------

      if (!req.file) {
        return res.status(400).json({
          success: false,
          error: "Image is required",
        });
      }

      // ----------------------------------------------
      // API KEY CHECK
      // ----------------------------------------------

      if (!OPENROUTER_API_KEY) {
        return res.status(500).json({
          success: false,
          error:
            "Missing OPENROUTER_API_KEY in .env",
        });
      }

      filePath = req.file.path;

      // ----------------------------------------------
      // QUESTION
      // ----------------------------------------------

      const question =
        req.body.question?.trim() ||
        "Briefly describe what you can see in this image.";

      // ----------------------------------------------
      // READ IMAGE
      // ----------------------------------------------

      const base64Image =
        fs
          .readFileSync(filePath)
          .toString("base64");

      const dataUrl =
        `data:${req.file.mimetype};base64,${base64Image}`;

      // ----------------------------------------------
      // SYSTEM PROMPT
      // ----------------------------------------------

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

      // ----------------------------------------------
      // MESSAGES
      // ----------------------------------------------

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

      // ----------------------------------------------
      // TRY MODELS
      // ----------------------------------------------

      for (const model of MODELS) {
        try {
          console.log(
            `🤖 Trying model: ${model}`
          );

          const response = await fetch(
            OPENROUTER_URL,
            {
              method: "POST",

              headers: {
                "Content-Type":
                  "application/json",

                Authorization:
                  `Bearer ${OPENROUTER_API_KEY}`,

                "HTTP-Referer":
                  "http://localhost:5173",

                "X-Title":
                  "VisionAI",
              },

              body: JSON.stringify({
                model,
                messages,
              }),
            }
          );

          const json =
            await response.json();

          // ------------------------------------------
          // SUCCESS
          // ------------------------------------------

          if (response.ok) {
            data = json;
            usedModel = model;

            console.log(
              `✅ Model success: ${model}`
            );

            break;
          }

          // ------------------------------------------
          // ERROR
          // ------------------------------------------

          console.error(
            `❌ Model error (${model}):`,
            json
          );

          lastError = json;

          const status =
            response.status;

          // Try another free model
          if (
            status === 404 ||
            status === 429
          ) {
            console.log(
              "⚠️ Trying next model..."
            );

            continue;
          }

          // Other error
          return res.status(status).json({
            success: false,

            error:
              "AI analysis failed",

            details:
              json.error?.message ||
              "Unknown OpenRouter error",
          });

        } catch (networkError) {
          console.error(
            `❌ Network error (${model}):`,
            networkError.message
          );

          lastError = {
            error: {
              message:
                networkError.message,
            },
          };
        }
      }

      // ----------------------------------------------
      // NO MODEL AVAILABLE
      // ----------------------------------------------

      if (!data) {
        return res.status(502).json({
          success: false,

          error:
            "AI analysis failed",

          details:
            lastError?.error?.message ||
            "All free models are unavailable or rate-limited",
        });
      }

      // ----------------------------------------------
      // ANSWER
      // ----------------------------------------------

      const answer =
        data.choices?.[0]?.message?.content ||
        "I could not generate an answer.";

      console.log("🤖 AI:", answer);

      // ----------------------------------------------
      // RESPONSE
      // ----------------------------------------------

      return res.json({
        success: true,

        provider:
          "OpenRouter",

        model:
          usedModel,

        answer,
      });

    } catch (error) {
      console.error(
        "❌ ANALYZE ERROR:",
        error
      );

      return res.status(500).json({
        success: false,

        error:
          "AI analysis failed",

        details:
          error.message ||
          "Unknown error",
      });

    } finally {
      // ----------------------------------------------
      // DELETE TEMP IMAGE
      // ----------------------------------------------

      if (filePath) {
        try {
          fs.unlinkSync(filePath);
        } catch (error) {
          console.log(
            "⚠️ Could not delete uploaded image"
          );
        }
      }
    }
  }
);

// ======================================================
// 404
// ======================================================

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: "Route not found",
    path: req.originalUrl,
  });
});

// ======================================================
// ERROR HANDLER
// ======================================================

app.use(
  (error, req, res, next) => {
    console.error(
      "❌ SERVER ERROR:",
      error
    );

    res.status(500).json({
      success: false,
      error:
        "Internal server error",
      details:
        error.message,
    });
  }
);

// ======================================================
// START SERVER
// ======================================================

app.listen(PORT, () => {
  console.log("");
  console.log(
    "======================================"
  );

  console.log(
    "🚀 VisionAI Backend Started"
  );

  console.log(
    `🌐 http://localhost:${PORT}`
  );

  console.log(
    "🔐 Firebase Google Auth: ENABLED"
  );

  console.log(
    "🤖 OpenRouter Vision: ENABLED"
  );

  console.log(
    "======================================"
  );

  console.log("");
});
