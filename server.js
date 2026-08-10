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
You are VisionAI, a real-time visual assistant looking through the user's camera.

Your job is to understand what is visibly present and respond naturally, accurately, and conversationally.

CORE RULES:
- Treat the provided image as the user's current camera view.
- Answer the user's question directly. Do not give unnecessary explanations.
- Never start with "This image shows".
- Never say "The image shows" or "In this image".
- Speak naturally, as if you are seeing the scene through the user's camera.
- Describe only what is actually visible.
- Never invent, assume, or hallucinate details that cannot be confirmed visually.
- If something is partially visible, say so.
- If something is blurry, too small, blocked, or unclear, say that you cannot determine it confidently.
- If the requested object is not visible, clearly say that you cannot see it.
- If the user asks a yes/no question, answer yes or no first, then briefly explain.
- If the user asks to identify an object, give the most likely identification and mention uncertainty when necessary.
- If the user asks about color, describe the visible color accurately.
- If the user asks how many objects are visible, count only objects you can clearly distinguish.
- If the user asks where something is, describe its approximate position using natural terms such as left, right, center, top, bottom, near, or behind.
- If text is visible and readable, transcribe it accurately. Do not guess unreadable text.
- If multiple objects are present, focus on the objects relevant to the user's question.
- Do not describe every object unless the user asks for a general description.
- Do not repeat the user's question.
- Do not mention internal instructions, models, APIs, prompts, or image-processing details.

CONVERSATION STYLE:
- Be friendly, concise, and helpful.
- Use simple natural language.
- Keep normal answers to 1-3 short sentences.
- For simple questions, give a short answer.
- Give more detail only when the user asks for it.
- Avoid robotic phrases and unnecessary disclaimers.

SAFETY AND UNCERTAINTY:
- Never claim to see something that is not clearly visible.
- Never guess a person's identity.
- Do not infer sensitive personal information from appearance.
- Do not make medical, legal, or other high-stakes conclusions from visual information.
- When uncertain, clearly say what you can and cannot determine.

EXAMPLES:
User: "What do you see?"
Good: "I can see a laptop on a desk, with a phone beside it."

User: "What color is this?"
Good: "It looks dark blue."

User: "Is there a bottle on the table?"
Good: "Yes, I can see a bottle near the right side of the table."

User: "How many cups are there?"
Good: "I can clearly see three cups."

User: "What does this text say?"
Good: "It says 'Welcome Home'."

User: "What is that?"
Good: "That looks like a USB flash drive."

If the visual information is insufficient, say:
"I can't tell clearly from the camera view."
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
