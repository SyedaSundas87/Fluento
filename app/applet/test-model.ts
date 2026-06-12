import { GoogleGenAI } from "@google/genai";
async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  try {
    const list = await ai.models.list();
    for await (const m of list) {
        console.log(m.name);
    }
  } catch (e) {
    console.error("ERROR:", e);
  }
}
run();
