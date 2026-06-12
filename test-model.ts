import { GoogleGenAI, Type } from "@google/genai";
async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-preview", // Note: trying the correct model instead of gemini-3-flash-preview
      contents: "Hello",
    });
    console.log(response.text);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
run();
