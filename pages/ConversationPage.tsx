import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { Mic, MicOff, AlertTriangle, Download, MessageCircle } from 'lucide-react';
import { type TranscriptMessage, Status, Role, type Correction, type Language, type Mode, type User, type Blob } from '../types';
import { decodeAudioData, createBlob, decode, playWebSpeechFallback } from '../utils/audioUtils';
import { isRateLimitError, wait } from '../utils/errorUtils';
import TranscriptView from '../components/TranscriptView';
import SessionSummaryBanner from '../components/SessionSummaryBanner';
import { trackConversationSession } from '../utils/progress';
import { detectFillerWords, getFillerSummary, type FillerSummary } from '../utils/fillerWordUtils';


interface ConversationPageProps {
  user: User;
  selectedLanguage: Language;
  selectedMode: Mode;
  initialScript?: {
    title: string;
    scenario: string;
    lines: { character: string; dialogue: string }[];
  };
}

interface LiveSession {
  sendRealtimeInput(input: { audio?: Blob; text?: string }): void;
  close(): void;
}

const ConversationPage: React.FC<ConversationPageProps> = ({ user, selectedLanguage, selectedMode, initialScript }) => {
  const [status, setStatus] = useState<Status>(Status.IDLE);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [lastSessionSummary, setLastSessionSummary] = useState<FillerSummary | null>(null);

  const startTimeRef = useRef<number | null>(null);
  const sessionDurationRef = useRef<number>(0);
  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const outputNodeRef = useRef<GainNode | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const nextStartTimeRef = useRef<number>(0);
  const audioSourcesRef = useRef<Set<AudioBufferSourceNode>>(new Set());
  
  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');
  const correctionCountRef = useRef(0);
  const totalFillersRef = useRef(0);

  useEffect(() => {
    return () => {
      if (status !== Status.IDLE) {
        stopConversation();
      }
    };
  }, [selectedLanguage, selectedMode]);

  const playPronunciation = useCallback(async (text: string, retryCount = 0) => {
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text: text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: {
              voiceConfig: {
                prebuiltVoiceConfig: { voiceName: selectedLanguage.voice },
              },
          },
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
         const audioCtx = outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed'
           ? outputAudioContextRef.current
           : new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
         if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
            outputAudioContextRef.current = audioCtx;
         }
         
         const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
         const source = audioCtx.createBufferSource();
         source.buffer = audioBuffer;
         source.connect(audioCtx.destination);
         source.start();
      }
    } catch (e: any) {
      if (isRateLimitError(e)) {
        console.warn("AI Quota reached, falling back to browser TTS.");
      } else {
        console.error("Error playing audio feedback:", e);
      }
      try {
        console.log("Falling back to browser SpeechSynthesis.");
        await playWebSpeechFallback(text, selectedLanguage.code);
        return;
      } catch (fallbackError) {
        console.error("Fallback TTS also failed:", fallbackError);
      }

      if (isRateLimitError(e) && retryCount < 3) {
         const delay = Math.pow(2, retryCount) * 2000;
         await wait(delay);
         return playPronunciation(text, retryCount + 1);
      }
    }
  }, [selectedLanguage.voice, selectedLanguage.code]);
  
  const stopAudioProcessing = useCallback(() => {
    streamRef.current?.getTracks().forEach(track => track.stop());
    streamRef.current = null;
    scriptProcessorRef.current?.disconnect();
    scriptProcessorRef.current = null;
    inputAudioContextRef.current?.state !== 'closed' && inputAudioContextRef.current?.close();
    if (outputAudioContextRef.current?.state !== 'closed') {
       audioSourcesRef.current.forEach(source => source.stop());
       audioSourcesRef.current.clear();
       outputNodeRef.current?.disconnect();
       outputNodeRef.current = null;
       outputAudioContextRef.current?.close();
    }
  }, []);

  const stopConversation = useCallback(async () => {
    setStatus(Status.STOPPING);
    
    let duration = 0;
    if (startTimeRef.current) {
      duration = (Date.now() - startTimeRef.current) / 1000;
      sessionDurationRef.current = duration;
    }

    if (transcripts.length >= 2) { 
      setShowSummary(true);
      trackConversationSession(user.email, correctionCountRef.current);
    }
    
    correctionCountRef.current = 0;
    startTimeRef.current = null;

    if (sessionPromiseRef.current) {
      try {
        const session = await sessionPromiseRef.current;
        session.close();
      } catch (e) { console.error("Error closing session:", e); }
      sessionPromiseRef.current = null;
      sessionRef.current = null;
    }
    stopAudioProcessing();
    setStatus(Status.IDLE);
  }, [stopAudioProcessing, user.email, transcripts.length]);

  const getCorrection = async (userText: string, retryCount = 0): Promise<Correction | null> => {
    if (!userText.trim()) return null;
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `You are an expert language tutor for a student learning ${selectedLanguage.name}. Your task is to analyze the user's sentence for grammatical errors, unnatural phrasing, or pronunciation issues. - If the sentence is grammatically correct and sounds natural, set "is_correct" to true. In this case, "corrected_sentence" and "explanation" can be empty strings. - If there are any errors, correct the sentence and provide a concise, friendly explanation of what was wrong and why the correction is better. - The explanation MUST be in ${selectedLanguage.name}. - You MUST respond with a valid JSON object that adheres to the provided schema. Do not add any markdown formatting like \`\`\`json.`;
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: userText,
        config: {
          systemInstruction,
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              is_correct: { type: Type.BOOLEAN },
              corrected_sentence: { type: Type.STRING },
              explanation: { type: Type.STRING },
            },
            required: ["is_correct", "corrected_sentence", "explanation"]
          },
        },
      });
      
      try {
        const resultText = response.text || '';
        if (!resultText || resultText === 'undefined') return null;
        const result = JSON.parse(resultText.replace(/```(json)?/gi, '').trim());
        if (result.is_correct) return null;
        correctionCountRef.current += 1; // Increment correction count
        return result;
      } catch (e) {
        console.error("Could not parse correction JSON:", response.text, e);
        // Return null to indicate no correction, preventing a crash.
        return null;
      }
    } catch (e: any) {
      if (isRateLimitError(e)) {
        if (retryCount < 3) {
           const delay = Math.pow(2, retryCount) * 2000;
           await wait(delay);
           return getCorrection(userText, retryCount + 1);
        }
        setError("Rate limit reached. Corrections are temporarily paused. This is a common limit on free API keys.");
      } else {
        console.error("Error getting correction:", e);
        setError("Could not get grammar correction due to an API error.");
      }
      return null;
    }
  };

  const startConversation = useCallback(async () => {
    setError(null);
    setStatus(Status.CONNECTING);
    setTranscripts([]);
    correctionCountRef.current = 0;
    totalFillersRef.current = 0;
    setLastSessionSummary(null);
    currentInputTranscriptionRef.current = '';
    currentOutputTranscriptionRef.current = '';
    startTimeRef.current = Date.now();
    setShowSummary(false);

    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const AudioCtor = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtor) throw new Error("AudioContext not supported by this browser.");

      const audioCtx = new AudioCtor({ sampleRate: 24000 });
      outputAudioContextRef.current = audioCtx;
      nextStartTimeRef.current = 0;
      audioSourcesRef.current.clear();
      const outputNode = audioCtx.createGain();
      outputNode.connect(audioCtx.destination);
      outputNodeRef.current = outputNode;

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const systemInstruction = `You are Alex, a friendly ${selectedLanguage.name} tutor.
      Mode: ${selectedMode.name}.
      ${initialScript ? `Scenario: ${initialScript.scenario}. Character: ${initialScript.lines[0].character}.` : ''}
      - Provide helpful feedback if the user makes a mistake.
      - Keep responses short and conversational.
      - If perfect, give brief praise.
      - Start by greeting in ${selectedLanguage.name}.`;

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: {
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: selectedLanguage.voice } 
            } 
          },
          systemInstruction: systemInstruction,
        },
        callbacks: {
          onopen: async () => {
            const session = await sessionPromiseRef.current;
            sessionRef.current = session;
            setStatus(Status.LISTENING);
            const ctx = new AudioCtor({ sampleRate: 16000 });
            inputAudioContextRef.current = ctx;
            if (ctx.state === 'suspended') {
              await ctx.resume();
            }
            const source = ctx.createMediaStreamSource(stream);
            const scriptProcessor = ctx.createScriptProcessor(2048, 1, 1);
            scriptProcessorRef.current = scriptProcessor;

            scriptProcessor.onaudioprocess = (audioProcessingEvent) => {
              if (sessionRef.current) {
                const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                const pcmBlob = createBlob(inputData);
                sessionRef.current.sendRealtimeInput({ audio: pcmBlob });
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(ctx.destination);
          },
          onmessage: async (message: LiveServerMessage) => {
            let isTurnComplete = false;
            let finalUserTranscript = '';

            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
              
              // Track fillers in real-time
              const detections = detectFillerWords(text);
              const count = detections.reduce((acc, curr) => acc + curr.count, 0);
              totalFillersRef.current += count;

              currentInputTranscriptionRef.current += text;
              setTranscripts(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === Role.USER) {
                    return [...prev.slice(0, -1), { ...last, text: currentInputTranscriptionRef.current }];
                }
                return [...prev, { id: `user-${Date.now()}`, role: Role.USER, text: currentInputTranscriptionRef.current }];
              });
            } else if (message.serverContent?.outputTranscription) {
              const text = message.serverContent.outputTranscription.text;
              currentOutputTranscriptionRef.current += text;
              setTranscripts(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === Role.AI) {
                   return [...prev.slice(0, -1), { id: last.id, role: Role.AI, text: currentOutputTranscriptionRef.current }];
                }
                return [...prev, { id: `ai-${Date.now()}`, role: Role.AI, text: currentOutputTranscriptionRef.current }];
              });
            }

            if(message.serverContent?.turnComplete) {
                isTurnComplete = true;
                finalUserTranscript = currentInputTranscriptionRef.current;
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
            }

            const modelAudioPart = message.serverContent?.modelTurn?.parts.find(p => p.inlineData);
            const base64Audio = modelAudioPart?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current && outputNodeRef.current) {
              setStatus(Status.SPEAKING);
              const audioCtx = outputAudioContextRef.current;
              const outputNode = outputNodeRef.current;
              
              // Ensure we start playing immediately or queue behind previous chunks
              const now = audioCtx.currentTime;
              if (nextStartTimeRef.current < now) {
                nextStartTimeRef.current = now + 0.1; // Small buffer
              }
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
              const source = audioCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              
              source.onended = () => {
                audioSourcesRef.current.delete(source);
                if (audioSourcesRef.current.size === 0) {
                   // Only set back to listening if we aren't still processing more chunks
                   setTimeout(() => {
                     if (audioSourcesRef.current.size === 0) setStatus(Status.LISTENING);
                   }, 100);
                }
              };

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }
            
            if (isTurnComplete && finalUserTranscript) {
                getCorrection(finalUserTranscript).then(correction => {
                    setTranscripts(prev => {
                        let lastUserMsgIndex = -1;
                        for (let i = prev.length - 1; i >= 0; i--) {
                            if (prev[i].role === Role.USER && !prev[i].isProcessed) {
                                lastUserMsgIndex = i;
                                break;
                            }
                        }
                        if(lastUserMsgIndex > -1){
                            const updatedTranscripts = [...prev];
                            updatedTranscripts[lastUserMsgIndex] = {...updatedTranscripts[lastUserMsgIndex], correction: correction ?? undefined, isProcessed: true };
                            return updatedTranscripts;
                        }
                        return prev;
                    });
                });
            }
          },
          onerror: (e: any) => {
            console.error("Session error:", e);
            if (isRateLimitError(e)) {
              setError("AI Session quota reached. Please wait a moment before trying again.");
            } else {
              setError(`Session error: ${e.message || 'An unknown error occurred.'}. Please try again.`);
            }
            stopConversation();
          },
          onclose: () => {
            stopAudioProcessing();
            setStatus(Status.IDLE);
          },
        },
      });
      await sessionPromiseRef.current;
    } catch (e: any) {
      console.error("Failed to start conversation:", e);
      setError(`Failed to start: ${e.message}. Check microphone permissions and reload.`);
      setStatus(Status.IDLE);
      stopAudioProcessing();
    }
  }, [stopConversation, stopAudioProcessing, selectedLanguage, selectedMode]);
  
  const handleToggleConversation = () => {
    if (status === Status.IDLE) {
      startConversation();
    } else {
      stopConversation();
    }
  };

  const downloadTranscript = () => {
    const content = transcripts.map(t => {
      let entry = `[${t.role.toUpperCase()}] ${t.text}`;
      if(t.correction) {
        entry += `\n[CORRECTION] -> "${t.correction.corrected_sentence}" (Reason: ${t.correction.explanation})`;
      }
      return entry;
    }).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'transcript.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const getStatusInfo = (): { text: string; color: string; pulse: boolean } => {
    switch (status) {
      case Status.IDLE: return { text: "Tap to start", color: "bg-gray-500", pulse: false };
      case Status.CONNECTING: return { text: "Connecting...", color: "bg-yellow-500", pulse: true };
      case Status.LISTENING: return { text: "Listening...", color: "bg-mic-glow", pulse: true };
      case Status.SPEAKING: return { text: "AI is speaking...", color: "bg-sky-cyan", pulse: true };
      case Status.STOPPING: return { text: "Stopping...", color: "bg-crimson-red", pulse: false };
      default: return { text: "Ready", color: "bg-gray-500", pulse: false };
    }
  };
  const { text: statusText, color: statusColor, pulse: statusPulse } = getStatusInfo();

  return (
    <div className="flex-1 flex flex-col h-full bg-deep-navy">
      <header className="p-4 border-b border-sky-cyan/20 bg-slate-blue/80 backdrop-blur-sm">
        <h1 className="text-xl font-bold text-electric-blue">Conversation Practice</h1>
        <p className="text-sm text-gray-400">Speak with an AI tutor to improve your fluency.</p>
      </header>

      <main className="flex-1 flex flex-col p-4 overflow-hidden">
        {transcripts.length === 0 ? (
           <div className="flex-1 flex flex-col items-center justify-center text-center text-gray-400">
             <MessageCircle size={64} className="mb-4 text-gray-500" />
             <h2 className="text-2xl font-semibold">Ready to Talk?</h2>
             <p className="max-w-sm mt-2">Press the microphone button below to start your conversation practice with Alex, your AI tutor.</p>
           </div>
        ) : (
          <TranscriptView transcripts={transcripts} playPronunciation={playPronunciation} />
        )}
        {error && (
            <div className="mt-4 p-3 bg-crimson-red/20 border border-crimson-red/50 rounded-lg flex items-center gap-3 animate-fade-in-up">
                <AlertTriangle className="h-6 w-6 text-crimson-red flex-shrink-0" />
                <p className="text-crimson-red text-sm">{error}</p>
            </div>
        )}
      </main>

      <footer className="p-4 border-t border-sky-cyan/20 bg-slate-blue/80 backdrop-blur-sm">
        <div className="flex flex-col items-center justify-center gap-4">
          <div className="flex items-center gap-3 h-6">
            <span className={`w-3 h-3 rounded-full ${statusColor} ${statusPulse ? 'animate-pulse' : ''}`}></span>
            <p className="font-medium text-gray-400">{statusText}</p>
          </div>
          <div className="flex items-center gap-4">
            <button
                onClick={downloadTranscript}
                disabled={transcripts.length === 0 || status !== Status.IDLE}
                className="w-20 h-20 rounded-full flex items-center justify-center transition-all bg-slate-blue hover:bg-user-bubble text-gray-400 focus:outline-none focus:ring-4 focus:ring-sky-cyan/50 disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Download Transcript"
              >
                <Download size={28} />
            </button>
            <button
              onClick={handleToggleConversation}
              disabled={status === Status.CONNECTING || status === Status.STOPPING}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg focus:outline-none focus:ring-4 focus:ring-opacity-50
                ${status === Status.IDLE ? 'bg-electric-blue/90 hover:bg-electric-blue text-deep-navy focus:ring-electric-blue/50' : 
                  status === Status.LISTENING ? `bg-mic-glow shadow-[0_0_15px_5px_#00FFFF] animate-pulse focus:ring-mic-glow/50` :
                  'bg-crimson-red hover:opacity-90 text-off-white focus:ring-crimson-red/50'}
                disabled:opacity-50 disabled:cursor-not-allowed`}
                aria-label={status === Status.IDLE ? 'Start conversation' : 'Stop conversation'}
            >
              {status !== Status.IDLE ? <MicOff size={48} className={status === Status.LISTENING ? 'text-deep-navy' : 'text-off-white'} /> : <Mic size={48} className="text-deep-navy"/>}
            </button>
            <div className="w-20 h-20"></div>
          </div>
        </div>
      </footer>

      {showSummary && (
        <SessionSummaryBanner 
          transcript={transcripts}
          durationSeconds={sessionDurationRef.current}
          onClose={() => setShowSummary(false)}
          onDownload={downloadTranscript}
        />
      )}
    </div>
  );
};

export default ConversationPage;