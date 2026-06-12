import { GoogleGenAI, Modality } from "@google/genai";

async function run() {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const sessionPromise = ai.live.connect({
    model: 'gemini-3.1-flash-live-preview',
    config: { 
      responseModalities: [Modality.AUDIO],
      inputAudioTranscription: {},
      outputAudioTranscription: {},
    },
    callbacks: {
      onopen: async () => {
        console.log("OPEN");
        const session = await sessionPromise;
        // Send empty audio
        const dummyPCM = new Uint8Array(2048).fill(0);
        session.sendRealtimeInput({
            text: "Hello, what's your name?"
        });
        setTimeout(() => session.close(), 2000);
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
}
run();
