import React, { useState, useRef, useCallback, useEffect } from 'react';
import { GoogleGenAI, Modality } from '@google/genai';
import { Mic, MicOff, AlertTriangle, RefreshCw, GraduationCap } from 'lucide-react';
import { type Language, Status, type User } from '../types';
import { playWebSpeechFallback } from '../utils/audioUtils';
import { trackAccentPractice } from '../utils/progress';
import { isRateLimitError, wait } from '../utils/errorUtils';

interface AccentCoachPageProps {
  user: User;
  selectedLanguage: Language;
}

const AccentCoachPage: React.FC<AccentCoachPageProps> = ({ user, selectedLanguage }) => {
  const [status, setStatus] = useState<Status>(Status.IDLE);
  const [sentence, setSentence] = useState('');
  const [userTranscript, setUserTranscript] = useState('');
  const [feedback, setFeedback] = useState('');
  const [score, setScore] = useState<number | null>(null);
  const [isFetchingSentence, setIsFetchingSentence] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);

  const fetchSentence = useCallback(async (retryCount = 0) => {
    setIsFetchingSentence(true);
    setSentence('');
    setFeedback('');
    setScore(null);
    setError(null);
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Generate one interesting, everyday sentence in ${selectedLanguage.name} for an accent practice session.`,
        config: { systemInstruction: "You generate sentences for language learners. Provide only the sentence text, with no extra commentary or quotation marks." }
      });
      
      const resText = response.text || '';
      if (!resText || resText === 'undefined') {
        throw new Error("AI returned empty or undefined sentence.");
      }
      setSentence(resText.trim());
    } catch (e: any) {
      console.error("Error fetching sentence:", e);
      if (isRateLimitError(e)) {
        if (retryCount < 3) {
          await wait(Math.pow(2, retryCount) * 2000);
          return fetchSentence(retryCount + 1);
        }
        setError("AI Quota reached. Please wait a moment and try again to fetch a new sentence.");
      } else {
        setError("Could not fetch a practice sentence. Please check your connection and try again.");
      }
    } finally {
      setIsFetchingSentence(false);
    }
  }, [selectedLanguage.name]);

  useEffect(() => {
    fetchSentence();
  }, [fetchSentence]);

  const playFeedbackAudio = async (text: string, retryCount = 0) => {
    if(!text) return;
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview", // Stable TTS 
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: selectedLanguage.voice }}},
        },
      });
      const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
      if (base64Audio) {
        const AudioCtor = window.AudioContext || window.webkitAudioContext;
        const audioCtx = outputAudioContextRef.current?.state === 'closed' || !outputAudioContextRef.current ? new AudioCtor({ sampleRate: 24000 }) : outputAudioContextRef.current;
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
          console.error("Error playing audio:", e);
        }
        try {
          console.log("Falling back to browser SpeechSynthesis.");
          await playWebSpeechFallback(text, selectedLanguage.code);
          return;
        } catch (fallbackError) {
          console.error("Fallback TTS also failed:", fallbackError);
        }

        if (isRateLimitError(e) && retryCount < 3) {
          await wait(Math.pow(2, retryCount) * 2000);
          return playFeedbackAudio(text, retryCount + 1);
        }
    }
  };
  
  const getAccentFeedback = async (audioBlob: Blob, retryCount = 0) => {
    if (!audioBlob || audioBlob.size === 0) {
        setError("I didn't capture any audio. Please try speaking again.");
        setStatus(Status.IDLE);
        return;
    };
    if (!sentence) return;

    setStatus(Status.SPEAKING);
    setFeedback("Analyzing your accent...");
    setScore(null);
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const systemInstruction = `You are an expert accent coach for ${selectedLanguage.name}. The user was asked to say: "${sentence}".
      First, transcribe exactly what the user said from their audio.
      1. Analyze their pronunciation for clarity, accuracy, and flow.
      2. Provide specific, constructive, and friendly feedback on which words or sounds they could improve. Keep the feedback concise (2-3 sentences).
      3. Provide a numerical score from 1 to 100 for their pronunciation accuracy.
      
      You MUST respond with valid JSON matching this schema:
      {
        "transcript": "exact transcription of their audio in the same language they spoke",
        "feedback": "your friendly feedback",
        "score": 85
      }`;
      
      const base64Audio = await blobToBase64(audioBlob);
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: [
            { inlineData: { mimeType: "audio/webm", data: base64Audio } }
        ],
        config: { 
            systemInstruction,
            responseMimeType: "application/json"
        }
      });
      
      const responseText = (response.text || '').trim();
      let parsedResponse;
      try {
          parsedResponse = JSON.parse(responseText.replace(/```(json)?/gi, '').trim());
      } catch (parseError) {
          console.error("Failed to parse JSON:", responseText, parseError);
          throw new Error("Invalid response format from AI.");
      }

      setUserTranscript(parsedResponse.transcript || "Could not transcribe");
      setFeedback(parsedResponse.feedback);
      setScore(parsedResponse.score);
      
      if (parsedResponse.score !== null) {
        trackAccentPractice(user.email, parsedResponse.score);
      }
      
      await playFeedbackAudio(parsedResponse.feedback);
    } catch (e: any) {
      console.error("Feedback error:", e);
      if (isRateLimitError(e)) {
        if (retryCount < 3) {
          await wait(Math.pow(2, retryCount) * 2000);
          return getAccentFeedback(audioBlob, retryCount + 1);
        }
        setError("AI Analysis limit reached. Please wait a moment before trying again.");
      } else {
        setError("Sorry, I couldn't analyze your accent right now. Something went wrong on our end.");
      }
      setFeedback('');
    } finally {
        setStatus(Status.IDLE);
    }
  };

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (typeof reader.result === 'string') {
          const base64String = reader.result.split(',')[1];
          resolve(base64String);
        } else {
          reject(new Error("Failed to convert blob to base64"));
        }
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const stopRecording = useCallback(async () => {
    if (status !== Status.LISTENING) return;
    setStatus(Status.STOPPING);
    
    return new Promise<void>((resolve) => {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        mediaRecorderRef.current.onstop = async () => {
          streamRef.current?.getTracks().forEach((track) => track.stop());
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
          await getAccentFeedback(audioBlob);
          resolve();
        };
        mediaRecorderRef.current.stop();
      } else {
          streamRef.current?.getTracks().forEach((track) => track.stop());
          resolve();
      }
    });

  }, [sentence, user.email, status]);

  const startRecording = useCallback(async () => {
    if (isFetchingSentence) return;
    setError(null);
    setFeedback('');
    setScore(null);
    setUserTranscript('');
    setStatus(Status.CONNECTING);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      
      const mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setStatus(Status.LISTENING);
    } catch (e: any) {
      setError(`Failed to start: ${e.message}. Check microphone permissions.`);
      setStatus(Status.IDLE);
    }
  }, [isFetchingSentence]);

  const handleToggleRecording = () => {
    if (status === Status.IDLE) {
      startRecording();
    } else if (status === Status.LISTENING) {
      stopRecording();
    }
  };

  const getStatusInfo = () => {
    switch (status) {
      case Status.IDLE: return "Tap to start recording";
      case Status.CONNECTING: return "Connecting...";
      case Status.LISTENING: return "Listening... Tap to stop";
      case Status.SPEAKING: return "Analyzing...";
      case Status.STOPPING: return "Processing...";
    }
  };
  
  const getScoreColor = (value: number | null) => {
    if (value === null) return 'text-off-white';
    if (value >= 85) return 'text-aqua-green';
    if (value >= 60) return 'text-yellow-400';
    return 'text-crimson-red';
  }

  return (
    <div className="flex-1 flex flex-col h-full bg-deep-navy">
      <header className="p-4 border-b border-sky-cyan/20 bg-slate-blue/80 backdrop-blur-sm">
        <h1 className="text-xl font-bold text-electric-blue">Accent Coach</h1>
        <p className="text-sm text-gray-400">Improve your pronunciation by reading sentences aloud.</p>
      </header>
      
      <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden text-center">
        <div className="w-full max-w-2xl">
            <h2 className="text-lg font-medium text-gray-400 mb-2">Read this sentence:</h2>
            <div className="relative bg-slate-blue border border-sky-cyan/20 rounded-xl p-6 mb-8 min-h-[100px] flex items-center justify-center">
                {isFetchingSentence ? (
                    <div className="w-8 h-8 border-4 border-t-transparent border-electric-blue rounded-full animate-spin"></div>
                ) : (
                    <p className="text-2xl font-semibold text-off-white">{sentence}</p>
                )}
                 <button onClick={() => fetchSentence(0)} disabled={isFetchingSentence || status !== Status.IDLE} className="absolute top-3 right-3 p-2 rounded-full text-gray-400 hover:bg-user-bubble disabled:opacity-50 disabled:cursor-not-allowed">
                    <RefreshCw size={20} className={isFetchingSentence ? 'animate-spin' : ''}/>
                </button>
            </div>
            <div className="bg-slate-blue border border-sky-cyan/20 rounded-xl p-4 mb-4 min-h-[60px]">
                <h2 className="text-sm font-medium text-gray-400 mb-1 text-left">You said:</h2>
                <p className="text-off-white text-left italic">{userTranscript || (status === Status.LISTENING ? 'Listening...' : 'Waiting for audio...')}</p>
            </div>
            <div className="grid grid-cols-3 gap-4">
                <div className="col-span-3 md:col-span-2 bg-slate-blue border border-sky-cyan/20 rounded-xl p-6 min-h-[120px]">
                    <h2 className="text-lg font-medium text-gray-400 mb-2 text-left">AI Feedback:</h2>
                    {feedback ? (
                        <p className="text-gray-300 text-left">{feedback}</p>
                    ): (
                        <div className="flex flex-col items-center justify-center text-gray-500 h-full">
                            <GraduationCap size={40}/>
                            <p className="mt-2">Your feedback will appear here.</p>
                        </div>
                    )}
                </div>
                <div className="col-span-3 md:col-span-1 bg-slate-blue border border-sky-cyan/20 rounded-xl p-6 flex flex-col items-center justify-center">
                    <h2 className="text-lg font-medium text-gray-400 mb-2">Score</h2>
                    <p className={`text-6xl font-bold ${getScoreColor(score)}`}>{score ?? '-'}</p>
                </div>
            </div>

            {error && (
                <div className="mt-4 p-3 bg-crimson-red/20 border border-crimson-red/50 rounded-lg flex items-center gap-3 animate-fade-in-up">
                    <AlertTriangle className="h-6 w-6 text-crimson-red flex-shrink-0" />
                    <p className="text-crimson-red text-sm">{error}</p>
                </div>
            )}
        </div>
      </main>

       <footer className="p-4 border-t border-sky-cyan/20 bg-slate-blue/80 backdrop-blur-sm flex flex-col items-center justify-center gap-4">
          <p className="h-6 font-medium text-gray-400">{getStatusInfo()}</p>
          <button
              onClick={handleToggleRecording}
              disabled={isFetchingSentence || status === Status.CONNECTING || status === Status.STOPPING || status === Status.SPEAKING}
              className={`w-24 h-24 rounded-full flex items-center justify-center transition-all shadow-lg focus:outline-none focus:ring-4 focus:ring-opacity-50
                ${status === Status.IDLE ? 'bg-electric-blue/90 hover:bg-electric-blue text-deep-navy focus:ring-electric-blue/50' : 
                  status === Status.LISTENING ? `bg-mic-glow shadow-[0_0_15px_5px_#00FFFF] animate-pulse focus:ring-mic-glow/50` :
                  'bg-crimson-red hover:opacity-90 text-off-white focus:ring-crimson-red/50'}
                disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {status === Status.LISTENING ? <MicOff size={48} className="text-deep-navy"/> : <Mic size={48} className="text-deep-navy"/>}
            </button>
        </footer>
    </div>
  );
};

export default AccentCoachPage;