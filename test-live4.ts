import { GoogleGenAI, Modality } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const sessionPromise = ai.live.connect({
    model: 'gemini-3.1-flash-live-preview',
    config: { 
      responseModalities: [Modality.TEXT],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      systemInstruction: "You are a helpful assistant.",
    },
    callbacks: {
      onopen: async () => {
        console.log("OPEN");
        const session = await sessionPromise;
        session.sendRealtimeInput({text: "Hello! Are you there?"});
      },
      onmessage: async (message: any) => {
        console.log("MESSAGE:", JSON.stringify(message, null, 2));
      },
      onerror: (error) => {
        console.error("ERROR:", error);
      },
      onclose: () => {
        console.log("CLOSED");
      }
    }
  });
  
  await new Promise(r => setTimeout(r, 10000));
  const session = await sessionPromise;
  session.close();
}
run();
