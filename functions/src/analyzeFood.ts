import { onCall, HttpsError } from "firebase-functions/v2/https";
import { defineSecret } from "firebase-functions/params";
import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "./rateLimiter";

export const geminiApiKey = defineSecret("GEMINI_API_KEY");

// Single configuration constant for the Gemini model name
export const GEMINI_MODEL = "gemini-3.5-flash";

const FOOD_ANALYSIS_PROMPT = `You are an expert nutritional estimation assistant.
Carefully inspect this image and determine if it contains visible food or beverages.

If the image DOES NOT contain any food or drink, output:
{
  "error": "no_food_detected",
  "message": "No food or drink could be identified in this photo. Please take a clear photo of your meal.",
  "items": []
}

If the image DOES contain food or drink, identify every distinct food item and estimate portion size and macronutrients.
All nutritional values are ESTIMATES.
For each item, return:
- name: Clear descriptive name (e.g., "Grilled Salmon Fillet")
- estimated_grams: Estimated weight in grams
- calories: Estimated kcal
- protein: Estimated protein in grams
- carbs: Estimated carbs in grams
- fat: Estimated total fat in grams
- fiber: Estimated dietary fiber in grams
- sugar: Estimated sugar in grams
- sodium: Estimated sodium in milligrams
- confidence: A numeric float between 0.0 and 1.0 representing your certainty in the identification and portion sizing.

Output valid JSON only matching the schema.`;

export const analyzeFood = onCall(
  {
    secrets: [geminiApiKey],
    memory: "512MiB",
    timeoutSeconds: 45,
    region: "us-central1",
  },
  async (request) => {
    const { imageBase64, mimeType, deviceId } = request.data;

    if (!deviceId || typeof deviceId !== "string" || deviceId.length < 16) {
      throw new HttpsError("invalid-argument", "Valid device identifier required.");
    }

    if (!imageBase64 || typeof imageBase64 !== "string") {
      throw new HttpsError("invalid-argument", "Missing image base64 data.");
    }

    const validMimeType = mimeType || "image/jpeg";

    // Rate limit: 30 food analyses per hour per device
    await checkRateLimit(deviceId, "analyzeFood", {
      maxRequests: 30,
      windowSeconds: 3600,
    });

    const apiKey = geminiApiKey.value();
    const ai = new GoogleGenAI({ apiKey });

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [
          {
            inlineData: {
              mimeType: validMimeType,
              data: imageBase64,
            },
          },
          {
            text: FOOD_ANALYSIS_PROMPT,
          },
        ],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              error: { type: "string" },
              message: { type: "string" },
              items: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    name: { type: "string" },
                    estimated_grams: { type: "number" },
                    calories: { type: "number" },
                    protein: { type: "number" },
                    carbs: { type: "number" },
                    fat: { type: "number" },
                    fiber: { type: "number" },
                    sugar: { type: "number" },
                    sodium: { type: "number" },
                    confidence: { type: "number" },
                  },
                  required: [
                    "name",
                    "estimated_grams",
                    "calories",
                    "protein",
                    "carbs",
                    "fat",
                    "fiber",
                    "sugar",
                    "sodium",
                    "confidence",
                  ],
                },
              },
            },
            required: ["items"],
          },
        },
      });

      const responseText = response.text;
      if (!responseText) {
        throw new HttpsError("internal", "Empty response received from AI model.");
      }

      return JSON.parse(responseText);
    } catch (error: any) {
      if (error instanceof HttpsError) throw error;
      console.error("Gemini food analysis error:", error);
      throw new HttpsError("internal", error.message || "Failed to analyze food photo.");
    }
  }
);
