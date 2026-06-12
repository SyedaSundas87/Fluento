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
        // Send empty audio or something
        // Instead of real audio, let's just send some dummy PCM
        const dummyPCM = new Uint8Array(2048).fill(0);
        session.sendRealtimeInput({
            audio: {
                mimeType: "audio/pcm;rate=16000",
                data: Buffer.from(dummyPCM).toString('base64')
            }
        });
        setTimeout(() => session.close(), 1000); // give it briefly
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
