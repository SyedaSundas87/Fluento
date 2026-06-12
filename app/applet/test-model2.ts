import { GoogleGenAI } from "@google/genai";
async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-2.5-flash", 
      contents: "Hello",
    });
    console.log(response.text);
  } catch (e) {
    console.error("ERROR:", e);
  }
}
run();
