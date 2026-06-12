import React, { useState, useRef, useCallback } from 'react';
// FIX: LiveSession is not exported from @google/genai. Use a local definition. Import Blob for the interface.
import { GoogleGenAI, LiveServerMessage, Modality } from '@google/genai';
import { Mic, MicOff, AlertTriangle, Volume2, ArrowRightLeft } from 'lucide-react';
import { type Language, Status, type Blob } from '../types';
import { decodeAudioData, createBlob, decode, playWebSpeechFallback } from '../utils/audioUtils';
import { LANGUAGES } from '../config';
import { isRateLimitError, wait } from '../utils/errorUtils';

// FIX: Define LiveSession interface locally as it's not exported from @google/genai.
interface LiveSession {
  sendRealtimeInput(input: { audio?: Blob; text?: string }): void;
  close(): void;
}

const TranslatorPage: React.FC = () => {
  const [status, setStatus] = useState<Status>(Status.IDLE);
  const [sourceLang, setSourceLang] = useState(LANGUAGES[0]);
  const [targetLang, setTargetLang] = useState(LANGUAGES[1]);
  const [transcribedText, setTranscribedText] = useState('');
  const [translatedText, setTranslatedText] = useState('');
  const [error, setError] = useState<string | null>(null);

  const sessionPromiseRef = useRef<Promise<LiveSession> | null>(null);
  const sessionRef = useRef<LiveSession | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const currentTranscriptionRef = useRef('');
  
  const playAudio = async (text: string, lang: Language, retryCount = 0) => {
    if (!text) return;
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
        config: {
          responseModalities: [Modality.AUDIO],
          speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: lang.voice }}},
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
        await playWebSpeechFallback(text, lang.code);
        setError(null);
        return;
      } catch (fallbackError) {
        console.error("Fallback TTS also failed:", fallbackError);
      }

      if (isRateLimitError(e) && retryCount < 4) {
        await wait(Math.pow(2, retryCount) * 3000);
        return playAudio(text, lang, retryCount + 1);
      }

      setError("Could not play translation audio. Rate limit may have been reached.");
    }
  };

  const translateText = async (text: string) => {
    if (!text.trim()) {
      setError("I didn't hear anything. Please speak clearly into the microphone.");
      setStatus(Status.IDLE);
      return;
    };
    setStatus(Status.SPEAKING); // Indicates processing/translating
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Translate the following text from ${sourceLang.name} to ${targetLang.name}: "${text}"`,
        config: { systemInstruction: "You are a helpful translator. Provide only the translated text, with no extra commentary." }
      });
      const translatedText = response.text || '';
      if (!translatedText || translatedText === 'undefined') {
        throw new Error("AI returned empty or undefined translation.");
      }
      const translation = translatedText.trim();
      setTranslatedText(translation);
      await playAudio(translation, targetLang);
    } catch (e) {
      console.error("Translation error:", e);
      setError("Failed to translate the text due to an API error.");
    } finally {
        setStatus(Status.IDLE);
    }
  };

  const stopRecording = useCallback(async () => {
    if (status !== Status.LISTENING) return;
    setStatus(Status.STOPPING);
    
    // Stop capturing but keep session alive for a moment for final chunks
    scriptProcessorRef.current?.disconnect();
    
    // Small delay to allow final transcription messages to arrive
    await new Promise(resolve => setTimeout(resolve, 1000));

    streamRef.current?.getTracks().forEach(track => track.stop());
    inputAudioContextRef.current?.state !== 'closed' && inputAudioContextRef.current?.close();
    
    if (sessionPromiseRef.current) {
        try {
            const session = await sessionPromiseRef.current;
            session.close();
        } catch(e) { console.error("Error closing session on stop:", e); }
        sessionPromiseRef.current = null;
        sessionRef.current = null;
    }
    
    // Process the final transcription after stopping
    const finalTranscript = currentTranscriptionRef.current;
    await translateText(finalTranscript);
    currentTranscriptionRef.current = '';

  }, [sourceLang.name, targetLang.name, status]);


  const startRecording = useCallback(async () => {
    setError(null);
    setTranscribedText('');
    setTranslatedText('');
    currentTranscriptionRef.current = '';
    setStatus(Status.CONNECTING);

    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const systemInstruction = `You are a translator from ${sourceLang.name} to ${targetLang.name}. 
      Listen and provide a fluent translation. Output only the translation.`;

      sessionPromiseRef.current = ai.live.connect({
        model: 'gemini-3.1-flash-live-preview',
        config: { 
          responseModalities: [Modality.AUDIO],
          inputAudioTranscription: {},
          outputAudioTranscription: {},
          speechConfig: { 
            voiceConfig: { 
              prebuiltVoiceConfig: { voiceName: sourceLang.voice } 
            } 
          },
          systemInstruction: systemInstruction,
        },
        callbacks: {
          onopen: async () => {
            const session = await sessionPromiseRef.current;
            sessionRef.current = session;
            setStatus(Status.LISTENING);
            const AudioCtor = window.AudioContext || window.webkitAudioContext;
            const audioCtx = new AudioCtor({ sampleRate: 16000 });
            inputAudioContextRef.current = audioCtx;
            if (audioCtx.state === 'suspended') {
              await audioCtx.resume();
            }
            const source = audioCtx.createMediaStreamSource(stream);
            const scriptProcessor = audioCtx.createScriptProcessor(2048, 1, 1);
            scriptProcessorRef.current = scriptProcessor;
            scriptProcessor.onaudioprocess = (e) => {
              if (sessionRef.current) {
                const inputData = e.inputBuffer.getChannelData(0);
                sessionRef.current.sendRealtimeInput({ audio: createBlob(inputData) });
              }
            };
            source.connect(scriptProcessor);
            scriptProcessor.connect(audioCtx.destination);
          },
          onmessage: (message: LiveServerMessage) => {
            if (message.serverContent?.inputTranscription) {
              currentTranscriptionRef.current += message.serverContent.inputTranscription.text;
              setTranscribedText(currentTranscriptionRef.current);
            }
          },
          onerror: (e: ErrorEvent) => {
            setError(`Session error: ${e.message}. Please try again.`);
            stopRecording();
          },
          onclose: () => { 
            // This is called when the session is closed, either manually or from an error.
            // The main logic is handled in stopRecording to ensure translation happens.
          },
        },
      });
    } catch (e: any) {
      setError(`Failed to start: ${e.message}. Check microphone permissions.`);
      setStatus(Status.IDLE);
    }
  }, [stopRecording]);

  const handleToggleRecording = () => {
    if (status === Status.IDLE) {
      startRecording();
    } else if (status === Status.LISTENING) {
      stopRecording();
    }
  };

  const swapLanguages = () => {
      setSourceLang(targetLang);
      setTargetLang(sourceLang);
  }

  const getStatusInfo = () => {
    switch (status) {
      case Status.IDLE: return "Tap to translate";
      case Status.CONNECTING: return "Connecting...";
      case Status.LISTENING: return "Listening... Tap to stop";
      case Status.SPEAKING: return "Translating & Speaking...";
      case Status.STOPPING: return "Processing...";
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-deep-navy">
      <header className="p-4 border-b border-sky-cyan/20 bg-slate-blue/80 backdrop-blur-sm">
        <h1 className="text-xl font-bold text-electric-blue">Voice Translator</h1>
        <p className="text-sm text-gray-400">Speak in one language and hear the translation in another.</p>
      </header>
      
      <main className="flex-1 flex flex-col items-center justify-center p-4 overflow-hidden">
        <div className="w-full max-w-2xl">
            <div className="flex items-center justify-between gap-2 mb-6">
              <LanguageSelector lang={sourceLang} setLang={setSourceLang} label="From" />
              <button onClick={swapLanguages} className="p-2 mt-6 rounded-full hover:bg-slate-blue transition-colors">
                  <ArrowRightLeft className="w-6 h-6 text-gray-400"/>
              </button>
              <LanguageSelector lang={targetLang} setLang={setTargetLang} label="To"/>
            </div>

            <div className="space-y-4">
                <TextBox title="You said:" text={transcribedText} lang={sourceLang} onPlay={playAudio}/>
                <TextBox title="Translation:" text={translatedText} lang={targetLang} onPlay={playAudio}/>
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
              disabled={status === Status.CONNECTING || status === Status.STOPPING || status === Status.SPEAKING}
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

const LanguageSelector = ({ lang, setLang, label }: { lang: Language, setLang: (l: Language) => void, label: string }) => (
    <div className="flex-1">
        <label className="block text-sm font-medium text-gray-500 mb-1">{label}</label>
        <div className="flex items-center gap-2 bg-slate-blue p-2 rounded-lg border border-sky-cyan/20">
            <span className="text-2xl flex-shrink-0">{lang.flag}</span>
            <select
            value={lang.code}
            onChange={(e) => setLang(LANGUAGES.find(l => l.code === e.target.value)!)}
            className="w-full bg-transparent text-off-white focus:outline-none appearance-none"
            >
            {LANGUAGES.map(l => <option className="bg-slate-blue text-off-white" key={l.code} value={l.code}>{l.name}</option>)}
            </select>
        </div>
    </div>
);

const TextBox = ({ title, text, lang, onPlay }: { title: string, text: string, lang: Language, onPlay: (t: string, l: Language) => void }) => (
    <div className="bg-slate-blue border border-sky-cyan/20 rounded-xl p-4 min-h-[100px] shadow-sm relative">
        <h3 className="font-semibold text-gray-400 mb-2">{title}</h3>
        <p className="text-off-white">{text || '...'}</p>
        {text && (
            <button onClick={() => onPlay(text, lang)} className="absolute top-3 right-3 p-2 rounded-full text-gray-400 hover:bg-user-bubble">
                <Volume2 size={20}/>
            </button>
        )}
    </div>
);

export default TranslatorPage;