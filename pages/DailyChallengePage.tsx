
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, LiveServerMessage, Modality, Type } from '@google/genai';
import { Mic, MicOff, Flame, Calendar, Trophy, Medal, Timer, BrainCircuit, AlertCircle, RefreshCcw } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { type TranscriptMessage, Status, Role, type User, type Language, type Blob } from '../types';
import { decodeAudioData, createBlob, decode } from '../utils/audioUtils';
import { isRateLimitError } from '../utils/errorUtils';
import { getDailyChallenge, getStreak, updateStreak, type StreakData } from '../utils/dailyChallenge';
import TranscriptView from '../components/TranscriptView';
import SessionSummaryBanner from '../components/SessionSummaryBanner';

interface DailyChallengePageProps {
  user: User;
  selectedLanguage: Language;
}

interface LiveSession {
  sendRealtimeInput(input: { audio?: Blob; text?: string }): void;
  close(): void;
}

const DailyChallengePage: React.FC<DailyChallengePageProps> = ({ user, selectedLanguage }) => {
  const [status, setStatus] = useState<Status>(Status.IDLE);
  const [transcripts, setTranscripts] = useState<TranscriptMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [showSummary, setShowSummary] = useState(false);
  const [challenge, setChallenge] = useState(() => getDailyChallenge());
  const [streakData, setStreakData] = useState<StreakData>(() => getStreak(user.email));
  const [countdown, setCountdown] = useState(120);
  const [isChallengeStarted, setIsChallengeStarted] = useState(false);
  const [isInitializing, setIsInitializing] = useState(false);

  useEffect(() => {
    const initChallenge = async (retryCount = 0) => {
      if (selectedLanguage.name === 'English') {
        setChallenge(getDailyChallenge());
        return;
      }
      
      setIsInitializing(true);
      try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
        const ai = new GoogleGenAI({ apiKey });
        const prompt = `Translate this daily speaking challenge into ${selectedLanguage.name}. 
        Keep the meaning exactly the same.
        Topic: ${challenge.topic}
        Prompt: ${challenge.prompt}
        
        Respond only with JSON: { "topic": "translated topic", "prompt": "translated prompt" }`;
        
        const response = await ai.models.generateContent({
           model: "gemini-3-flash-preview",
           contents: prompt,
           config: {
             responseMimeType: "application/json",
             responseSchema: {
               type: Type.OBJECT,
               properties: {
                 topic: { type: Type.STRING },
                 prompt: { type: Type.STRING }
               },
               required: ["topic", "prompt"]
             }
           }
        });
        
        const challengeText = response.text || '';
        if (!challengeText || challengeText === 'undefined') {
            throw new Error("AI returned empty content for daily challenge translation.");
        }
        let data;
        try {
          data = JSON.parse(challengeText.replace(/```(json)?/gi, '').trim());
        } catch (parseError) {
          console.error("Failed to parse challenge JSON:", challengeText, parseError);
          throw new Error("AI returned malformed challenge content.");
        }
        setChallenge(prev => ({ ...prev, topic: data.topic, prompt: data.prompt }));
      } catch (e: any) {
        console.error("Error translating challenge:", e);
        if (isRateLimitError(e) && retryCount < 2) {
           await new Promise(r => setTimeout(r, 2000));
           return initChallenge(retryCount + 1);
        }
      } finally {
        setIsInitializing(false);
      }
    };

    initChallenge();
  }, [selectedLanguage.name]);

  const transcriptsRef = useRef<TranscriptMessage[]>([]);
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
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentInputTranscriptionRef = useRef('');
  const currentOutputTranscriptionRef = useRef('');

  useEffect(() => {
    transcriptsRef.current = transcripts;
  }, [transcripts]);

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

  useEffect(() => {
    return () => {
      stopAudioProcessing();
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [stopAudioProcessing]);

  const stopChallenge = useCallback(async () => {
    if (status === Status.STOPPING || status === Status.IDLE) return;
    setStatus(Status.STOPPING);
    
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }

    if (transcriptsRef.current.length >= 1) {
      sessionDurationRef.current = challenge.duration - countdown;
      setShowSummary(true);
      const newData = updateStreak(user.email);
      setStreakData(newData);
    }

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
  }, [stopAudioProcessing, user.email, challenge.duration, status, countdown]);

  useEffect(() => {
    if (isChallengeStarted && countdown <= 0 && status !== Status.IDLE && status !== Status.STOPPING) {
      stopChallenge();
    }
  }, [countdown, isChallengeStarted, status, stopChallenge]);

  const downloadTranscript = () => {
    const content = transcripts.map(t => {
      let entry = `[${t.role.toUpperCase()}] ${t.text}`;
      return entry;
    }).join('\n\n');
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'daily_challenge_transcript.txt';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const startChallenge = useCallback(async () => {
    setError(null);
    setStatus(Status.CONNECTING);
    setTranscripts([]);
    setCountdown(challenge.duration);
    setIsChallengeStarted(true);
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

      const systemInstruction = `You are a high-stakes speaking examiner.
      Topic: ${challenge.topic}. Prompt: ${challenge.prompt}.
      Target: ${selectedLanguage.name}. 
      Introduce yourself, present the prompt, and ask 1-2 follow-up questions. 
      Be formal but encouraging.`;

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
            
            // Start countdown when listening starts
            countdownIntervalRef.current = setInterval(() => {
              setCountdown(prev => {
                if (prev <= 1) return 0;
                return prev - 1;
              });
            }, 1000);

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
            if (message.serverContent?.inputTranscription) {
              const text = message.serverContent.inputTranscription.text;
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
                currentInputTranscriptionRef.current = '';
                currentOutputTranscriptionRef.current = '';
            }

            const modelAudioPart = message.serverContent?.modelTurn?.parts.find(p => p.inlineData);
            const base64Audio = modelAudioPart?.inlineData?.data;
            if (base64Audio && outputAudioContextRef.current && outputNodeRef.current) {
              setStatus(Status.SPEAKING);
              const audioCtx = outputAudioContextRef.current;
              const outputNode = outputNodeRef.current;
              
              const now = audioCtx.currentTime;
              if (nextStartTimeRef.current < now) {
                nextStartTimeRef.current = now + 0.1;
              }
              
              const audioBuffer = await decodeAudioData(decode(base64Audio), audioCtx, 24000, 1);
              const source = audioCtx.createBufferSource();
              source.buffer = audioBuffer;
              source.connect(outputNode);
              
              source.onended = () => {
                audioSourcesRef.current.delete(source);
                if (audioSourcesRef.current.size === 0) {
                  setTimeout(() => {
                    if (audioSourcesRef.current.size === 0) setStatus(Status.LISTENING);
                  }, 100);
                }
              };

              source.start(nextStartTimeRef.current);
              nextStartTimeRef.current += audioBuffer.duration;
              audioSourcesRef.current.add(source);
            }
          },
          onerror: (e: any) => {
            console.error("Challenge session error:", e);
            if (isRateLimitError(e)) {
              setError("Daily challenge rate limit reached. Please try again in a few minutes.");
            } else {
              const errMsg = e.message || (e.error?.message) || (typeof e === 'string' ? e : 'WebSocket handshake failed');
              setError(`Session error: ${errMsg}. Check console for details.`);
            }
            stopChallenge();
          },
          onclose: () => {
            stopAudioProcessing();
            setStatus(Status.IDLE);
          },
        },
      });
      await sessionPromiseRef.current;
    } catch (e: any) {
      console.error("Failed to start daily challenge:", e);
      setError(`Failed to start: ${e.message}.`);
      setStatus(Status.IDLE);
      stopAudioProcessing();
    }
  }, [stopChallenge, stopAudioProcessing, selectedLanguage, challenge]);

  // Calendar Heatmap Data
  const renderCalendar = () => {
    const today = new Date();
    const days = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date();
      d.setDate(today.getDate() - i);
      const ds = d.toISOString().split('T')[0];
      const isCompleted = streakData.history.includes(ds);
      days.push({ date: ds, completed: isCompleted });
    }
    return (
      <div className="grid grid-cols-10 gap-2">
        {days.map((day, i) => (
          <div 
            key={i} 
            className={`w-4 h-4 rounded-sm transition-colors ${
              day.completed ? 'bg-aqua-green shadow-[0_0_8px_rgba(0,255,163,0.4)]' : 'bg-slate-blue border border-sky-cyan/10'
            }`}
            title={day.date}
          />
        ))}
      </div>
    );
  };

  const getBadges = () => {
    const badges = [];
    if (streakData.history.length > 0) badges.push({ icon: Trophy, label: "First Challenge", color: "text-sky-cyan" });
    if (streakData.longestStreak >= 7) badges.push({ icon: Medal, label: "7-Day Streak", color: "text-electric-blue" });
    if (streakData.longestStreak >= 30) badges.push({ icon: Flame, label: "30-Day Streak", color: "text-crimson-red" });
    return badges;
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-deep-navy overflow-y-auto">
      <header className="p-6 border-b border-sky-cyan/20 bg-slate-blue/80 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-cyan/5 rounded-full blur-2xl"></div>
        <div className="relative flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-electric-blue flex items-center gap-2">
              <Flame className="text-crimson-red" />
              Daily Challenge
            </h1>
            <p className="text-gray-400">Complete one 2-minute challenge every day to build your streak.</p>
          </div>
          <div className="flex items-center gap-4">
             <div className="bg-deep-navy px-4 py-2 rounded-xl border border-sky-cyan/20 flex items-center gap-2">
                <Flame className="text-crimson-red w-5 h-5 fill-crimson-red" />
                <span className="font-bold text-off-white">{streakData.currentStreak} day streak</span>
             </div>
          </div>
        </div>
      </header>

      <main className="flex-1 p-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Challenge Stage */}
        <div className="lg:col-span-2 flex flex-col gap-6">
            {isInitializing ? (
               <div className="bg-slate-blue p-8 rounded-3xl border border-sky-cyan/10 flex-1 flex flex-col items-center justify-center text-center space-y-6">
                  <div className="w-12 h-12 border-4 border-t-transparent border-electric-blue rounded-full animate-spin"></div>
                  <p className="text-gray-400">Preparing today's challenge in {selectedLanguage.name}...</p>
               </div>
            ) : !isChallengeStarted ? (
             <div className="bg-slate-blue p-8 rounded-3xl border border-sky-cyan/10 flex-1 flex flex-col items-center justify-center text-center space-y-6">
                <div className="w-20 h-20 bg-electric-blue/10 rounded-full flex items-center justify-center">
                  <BrainCircuit size={40} className="text-electric-blue" />
                </div>
                <div className="space-y-2">
                  <h2 className="text-2xl font-bold text-off-white tracking-tight">{challenge.topic}</h2>
                  <p className="text-gray-400 max-w-md mx-auto">{challenge.prompt}</p>
                </div>
                <div className="flex items-center gap-4 text-sm text-gray-500">
                   <div className="flex items-center gap-1"><Timer size={14} /> 2 Minutes</div>
                   <div className="flex items-center gap-1"><Calendar size={14} /> {challenge.date}</div>
                </div>
                <button 
                  onClick={startChallenge}
                  className="px-10 py-4 bg-electric-blue text-deep-navy font-bold rounded-2xl hover:scale-105 transition-transform shadow-lg shadow-electric-blue/20"
                >
                  Enter Challenge Room
                </button>
             </div>
           ) : (
             <div className="bg-slate-blue flex-1 flex flex-col rounded-3xl border border-sky-cyan/10 overflow-hidden">
                <div className="p-4 bg-deep-navy/40 border-b border-sky-cyan/10 flex justify-between items-center">
                   <div className="flex items-center gap-3">
                      <div className={`w-3 h-3 rounded-full ${status === Status.LISTENING ? 'bg-mic-glow animate-pulse' : 'bg-gray-500'}`} />
                      <span className="text-sm font-medium text-gray-300">{challenge.topic}</span>
                   </div>
                   <div className={`flex items-center gap-2 font-mono text-xl ${countdown < 30 ? 'text-crimson-red' : 'text-sky-cyan'}`}>
                      <Timer />
                      {Math.floor(countdown / 60)}:{(countdown % 60).toString().padStart(2, '0')}
                   </div>
                </div>
                
                <div className="flex-1 p-4 overflow-hidden flex flex-col">
                   <TranscriptView transcripts={transcripts} playPronunciation={() => {}} />
                </div>

                <div className="p-6 bg-deep-navy/40 flex justify-center">
                   {status === Status.IDLE || status === Status.STOPPING ? (
                     <button className="px-8 py-3 bg-gray-500 text-off-white rounded-xl disabled:opacity-50" disabled>Challenge Ended</button>
                   ) : (
                     <button 
                      onClick={stopChallenge}
                      className="w-20 h-20 bg-crimson-red rounded-full flex items-center justify-center text-off-white shadow-lg hover:scale-105 transition-transform"
                     >
                       <MicOff size={32} />
                     </button>
                   )}
                </div>
             </div>
           )}
           {error && (
             <div className="p-4 bg-crimson-red/20 border border-crimson-red/30 rounded-xl flex items-center gap-3 text-crimson-red">
               <AlertCircle /> {error}
             </div>
           )}
        </div>

        {/* Right Column: Stats & Badges */}
        <div className="space-y-6">
           <div className="bg-slate-blue p-6 rounded-3xl border border-sky-cyan/10 space-y-6">
              <h3 className="font-bold text-electric-blue uppercase tracking-wider text-xs">Streak Map (30 Days)</h3>
              {renderCalendar()}
              <div className="pt-4 border-t border-sky-cyan/10 grid grid-cols-2 gap-4">
                 <div className="text-center">
                    <p className="text-2xl font-black text-off-white">{streakData.currentStreak}</p>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Current</p>
                 </div>
                 <div className="text-center">
                    <p className="text-2xl font-black text-sky-cyan">{streakData.longestStreak}</p>
                    <p className="text-[10px] text-gray-500 uppercase font-bold">Longest</p>
                 </div>
              </div>
           </div>

           <div className="bg-slate-blue p-6 rounded-3xl border border-sky-cyan/10 space-y-4">
              <h3 className="font-bold text-electric-blue uppercase tracking-wider text-xs">Your Badges</h3>
              <div className="space-y-3">
                 {getBadges().map((badge, i) => (
                   <div key={i} className="flex items-center gap-3 p-3 bg-deep-navy/40 rounded-xl border border-sky-cyan/5">
                      <div className={`p-2 rounded-lg bg-white/5 ${badge.color}`}>
                        <badge.icon size={20} />
                      </div>
                      <span className="text-sm font-medium text-gray-300">{badge.label}</span>
                   </div>
                 ))}
                 {getBadges().length === 0 && (
                   <p className="text-sm text-gray-500 italic">No badges earned yet. Complete your first challenge!</p>
                 )}
              </div>
           </div>
        </div>
      </main>

      {showSummary && (
        <SessionSummaryBanner 
          transcript={transcripts}
          durationSeconds={sessionDurationRef.current}
          onClose={() => {
            setShowSummary(false);
            setIsChallengeStarted(false);
          }}
          onDownload={downloadTranscript}
        />
      )}
    </div>
  );
};

export default DailyChallengePage;
