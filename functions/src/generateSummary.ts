import { onCall, HttpsError } from "firebase-functions/v2/https";
import { GoogleGenAI } from "@google/genai";
import { checkRateLimit } from "./rateLimiter";
import { geminiApiKey, GEMINI_MODEL } from "./analyzeFood";

export const generateSummary = onCall(
  {
    secrets: [geminiApiKey],
    memory: "256MiB",
    timeoutSeconds: 45,
    region: "us-central1",
  },
  async (request) => {
    const { deviceId, date, foodLog, healthData, profile } = request.data;

    if (!deviceId || typeof deviceId !== "string" || deviceId.length < 16) {
      throw new HttpsError("invalid-argument", "Valid device identifier required.");
    }

    // Rate limit: 10 summary requests per hour per device
    await checkRateLimit(deviceId, "generateSummary", {
      maxRequests: 10,
      windowSeconds: 3600,
    });

    const apiKey = geminiApiKey.value();
    const ai = new GoogleGenAI({ apiKey });

    const prompt = `You are a supportive, insightful health and nutrition coach for CaloriQ.
Analyze the user's daily food intake and physical activity metrics for ${date || "today"}.

USER PROFILE:
- Primary Fitness Goal: ${profile?.goal || "maintain"} (lose/gain/maintain)
- Biological Sex: ${profile?.sex || "unspecified"}
- Age: ${profile?.age || "unspecified"}
- Estimated TDEE: ${profile?.tdee || 2000} kcal
- Daily Calorie Target: ${profile?.dailyCalorieTarget || 2000} kcal

TODAY'S ACTIVITY DATA:
- Steps Taken: ${healthData?.steps || 0}
- Total Calories Burned: ${healthData?.totalCaloriesBurned || 0} kcal (est.)
- Active Calories: ${healthData?.activeCalories || 0} kcal

TODAY'S FOOD LOG:
${JSON.stringify(foodLog ?? [], null, 2)}

Provide an honest, encouraging evaluation tailored directly to whether they are aiming to LOSE or GAIN weight:
1. total_calories_in: Sum of all calories eaten today.
2. total_calories_burned: Total energy burned today.
3. net_vs_goal: Calories in minus daily target. (Negative means under goal; positive means over goal).
4. macro_summary: Total protein (g), carbs (g), fat (g), fiber (g).
5. steps: Total steps.
6. pros: 2 to 3 genuine positive strengths observed in today's nutrition/habits.
7. cons: 2 to 3 constructive weaknesses or missing elements (e.g. low fiber, high sugar spikes, insufficient protein).
8. suggestions: 2 to 3 realistic, concrete dietary or activity suggestions for tomorrow to get closer to their goal.
9. overall_rating: "great" | "good" | "needs_improvement"

Always remember all values are estimates. Do not make medical claims.
Output valid JSON only matching the schema.`;

    try {
      const response = await ai.models.generateContent({
        model: GEMINI_MODEL,
        contents: [{ text: prompt }],
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: "object",
            properties: {
              total_calories_in: { type: "number" },
              total_calories_burned: { type: "number" },
              net_vs_goal: { type: "number" },
              macro_summary: {
                type: "object",
                properties: {
                  protein_g: { type: "number" },
                  carbs_g: { type: "number" },
                  fat_g: { type: "number" },
                  fiber_g: { type: "number" },
                },
                required: ["protein_g", "carbs_g", "fat_g", "fiber_g"],
              },
              steps: { type: "number" },
              pros: {
                type: "array",
                items: { type: "string" },
              },
              cons: {
                type: "array",
                items: { type: "string" },
              },
              suggestions: {
                type: "array",
                items: { type: "string" },
              },
              overall_rating: {
                type: "string",
                enum: ["great", "good", "needs_improvement"],
              },
            },
            required: [
              "total_calories_in",
              "total_calories_burned",
              "net_vs_goal",
              "macro_summary",
              "steps",
              "pros",
              "cons",
              "suggestions",
              "overall_rating",
            ],
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
      console.error("Gemini daily summary error:", error);
      throw new HttpsError("internal", error.message || "Failed to generate daily summary.");
    }
  }
);
