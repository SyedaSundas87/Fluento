
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { 
  GraduationCap, 
  Mic, 
  MicOff, 
  Play, 
  RefreshCcw, 
  ChevronRight, 
  Award, 
  CheckCircle2, 
  Share2, 
  AlertCircle,
  Volume2,
  BrainCircuit,
  Timer
} from 'lucide-react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { motion, AnimatePresence } from 'motion/react';
import { isRateLimitError, wait } from '../utils/errorUtils';
import { type User, type Language, Status } from '../types';
import { decodeAudioData, createBlob, decode, playWebSpeechFallback } from '../utils/audioUtils';
import { READ_ALOUD_BANK, REPEAT_PHRASES_BANK, DESCRIPTION_TOPICS, OPINION_QUESTIONS } from '../constants/assessmentData';

interface AssessmentPageProps {
  user: User;
  selectedLanguage: Language;
}

type AssessmentStage = 'intro' | 'read_aloud' | 'repeat' | 'description' | 'opinion' | 'results';

interface StageScore {
  score: number;
  feedback: string;
  transcription?: string;
}

interface AssessmentResults {
  readAloud: StageScore;
  repeat: StageScore;
  description: StageScore;
  opinion: StageScore;
  overallScore: number;
  cefrLevel: string;
  strengths: string[];
  improvements: string[];
  recommendation: string;
}

const AssessmentPage: React.FC<AssessmentPageProps> = ({ user, selectedLanguage }) => {
  const [stage, setStage] = useState<AssessmentStage>('intro');
  const [subStep, setSubStep] = useState(0); // For multi-step stages like Read Aloud (2 sentences)
  const [status, setStatus] = useState<Status>(Status.IDLE);
  const [error, setError] = useState<string | null>(null);
  const [isEvaluating, setIsEvaluating] = useState(false);
  
  // Assessment Content
  const [readAloudItems, setReadAloudItems] = useState<any[]>([]);
  const [repeatItems, setRepeatItems] = useState<string[]>([]);
  const [descriptionTopic, setDescriptionTopic] = useState('');
  const [opinionQuestion, setOpinionQuestion] = useState('');
  
  // Results
  const [scores, setScores] = useState<Partial<AssessmentResults>>({});
  
  // Recording Refs
  const audioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const [recordingSeconds, setRecordingSeconds] = useState(0);

  // Canvas for Sharing
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    return () => {
      outputAudioContextRef.current?.close();
    };
  }, []);

  // Initialize Assessment Items
  const initAssessment = useCallback(async (retryCount = 0) => {
    setStage('intro');
    setSubStep(0);
    setError(null);
    setScores({});
    setIsEvaluating(true);

    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      
      // LAYER 1: Generate in English first
      const englishPrompt = `Generate assessment content for a speaking test.
      Respond ONLY in JSON format:
      {
        "readAloud": [
          { "text": "A simple sentence", "difficulty": "A1" },
          { "text": "A complex sentence", "difficulty": "B2" }
        ],
        "repeatPhrases": ["Phrase 1", "Phrase 2", "Phrase 3"],
        "descriptionTopic": "A topic for 60 seconds description",
        "opinionQuestion": "A thought-provoking question for a 90 second answer"
      }`;

      const englishResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: englishPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              readAloud: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    difficulty: { type: Type.STRING }
                  },
                  required: ["text", "difficulty"]
                }
              },
              repeatPhrases: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              descriptionTopic: { type: Type.STRING },
              opinionQuestion: { type: Type.STRING }
            },
            required: ["readAloud", "repeatPhrases", "descriptionTopic", "opinionQuestion"]
          }
        }
      });
      
      const englishText = englishResponse.text || '';
      if (!englishText || englishText === 'undefined') {
          throw new Error("AI returned empty content for primary assessment generation.");
      }
      let englishData;
      try {
        const parsed = JSON.parse(englishText.replace(/```(json)?/gi, '').trim());
        englishData = parsed;
      } catch (parseError) {
        console.error("Failed to parse primary assessment JSON:", englishText, parseError);
        throw new Error("AI returned malformed assessment data.");
      }

      // LAYER 2: Translate to target language
      const translationPrompt = `Translate the following assessment content from English to ${selectedLanguage.name}.
      Keep the JSON structure exactly the same.
      All text values should be in ${selectedLanguage.name}.
      
      JSON to translate:
      ${JSON.stringify(englishData)}
      
      Respond only with the translated JSON.`;

      const translatedResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: translationPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              readAloud: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    text: { type: Type.STRING },
                    difficulty: { type: Type.STRING }
                  },
                  required: ["text", "difficulty"]
                }
              },
              repeatPhrases: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              },
              descriptionTopic: { type: Type.STRING },
              opinionQuestion: { type: Type.STRING }
            },
            required: ["readAloud", "repeatPhrases", "descriptionTopic", "opinionQuestion"]
          }
        }
      });

      const translatedText = translatedResponse.text || '';
      if (!translatedText || translatedText === 'undefined') {
          throw new Error("AI returned empty content for translated assessment generation.");
      }
      try {
        const parsed = JSON.parse(translatedText.replace(/```(json)?/gi, '').trim());
        setReadAloudItems(parsed.readAloud);
        setRepeatItems(parsed.repeatPhrases);
        setDescriptionTopic(parsed.descriptionTopic);
        setOpinionQuestion(parsed.opinionQuestion);
      } catch (parseError) {
        console.error("Failed to parse translated assessment JSON:", translatedText, parseError);
        throw new Error("AI returned malformed assessment translations.");
      }
    } catch (e: any) {
      console.error("Error initializing assessment:", e);
      if (isRateLimitError(e) && retryCount < 3) {
        await wait(Math.pow(2, retryCount) * 2000);
        return initAssessment(retryCount + 1);
      }
      setError("Failed to load assessment content. Using standard set.");
      // Fallback to English (not ideal but avoids break)
      const ra = [...READ_ALOUD_BANK].sort(() => 0.5 - Math.random()).slice(0, 2);
      const rp = [...REPEAT_PHRASES_BANK].sort(() => 0.5 - Math.random()).slice(0, 3);
      const dt = DESCRIPTION_TOPICS[Math.floor(Math.random() * DESCRIPTION_TOPICS.length)];
      const oq = OPINION_QUESTIONS[Math.floor(Math.random() * OPINION_QUESTIONS.length)];
      setReadAloudItems(ra);
      setRepeatItems(rp);
      setDescriptionTopic(dt);
      setOpinionQuestion(oq);
    } finally {
      setIsEvaluating(false);
    }
  }, [selectedLanguage.name]);

  useEffect(() => {
    initAssessment();
  }, [initAssessment]);

  // Audio Recording Helpers
  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      audioChunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      mediaRecorder.start();
      setStatus(Status.LISTENING);
      setRecordingSeconds(0);
      timerRef.current = setInterval(() => {
        setRecordingSeconds(prev => prev + 1);
      }, 1000);
    } catch (err) {
      console.error("Error starting recording:", err);
      setError("Microphone access denied or not available.");
    }
  };

  const stopRecording = (): Promise<Blob> => {
    return new Promise((resolve) => {
      if (!mediaRecorderRef.current || status !== Status.LISTENING) {
        resolve(new Blob());
        return;
      }

      mediaRecorderRef.current.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        resolve(audioBlob);
      };

      mediaRecorderRef.current.stop();
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (timerRef.current) clearInterval(timerRef.current);
      setStatus(Status.IDLE);
    });
  };

  // Gemini Helpers
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  const ai = new GoogleGenAI({ apiKey });

  const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, _) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve((reader.result as string).split(',')[1]);
      reader.readAsDataURL(blob);
    });
  };

  const playTTS = async (text: string, retryCount = 0) => {
    try {
      const response = await ai.models.generateContent({
        model: "gemini-3.1-flash-tts-preview",
        contents: [{ parts: [{ text }] }],
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
        let audioCtx = outputAudioContextRef.current;
        if (!audioCtx || audioCtx.state === 'closed') {
          const AudioCtor = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AudioCtor({ sampleRate: 24000 });
          outputAudioContextRef.current = audioCtx;
        }
        if (audioCtx.state === 'suspended') {
          await audioCtx.resume();
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
        console.error("TTS Error:", e);
      }
      try {
        console.log("Falling back to browser SpeechSynthesis.");
        await playWebSpeechFallback(text, selectedLanguage.code);
        setError(null);
        return;
      } catch (fallbackError) {
        console.error("Fallback TTS also failed:", fallbackError);
      }

      if (isRateLimitError(e) && retryCount < 4) {
        const delay = Math.pow(2, retryCount) * 3000;
        await wait(delay);
        return playTTS(text, retryCount + 1);
      }
      setError("Audio feedback limit reached. Please wait a moment.");
    }
  };

  // Evaluation Logic
  const evaluateStage = async (audioBlob: Blob, stageType: AssessmentStage, context: string) => {
    setIsEvaluating(true);
    try {
      const base64Audio = await blobToBase64(audioBlob);
      
      let criteria = "";
      switch (stageType) {
        case 'read_aloud':
          criteria = "pronunciation accuracy, pace, and clarity";
          break;
        case 'repeat':
          criteria = "comparison between user transcription and target phrase. Score 100 for exact match, partial for close matches (synonyms or minor errors), and 0 for completely wrong or silent responses.";
          break;
        case 'description':
          criteria = "vocabulary variety, sentence structure, and coherence. The user is describing a scenario.";
          break;
        case 'opinion':
          criteria = "argument structure, use of connectors, and fluency. The user is answering an opinion question.";
          break;
        default:
          criteria = "pronunciation, fluency, and accuracy";
      }

      const systemInstruction = `You are a high-stakes ${selectedLanguage.name} Proficiency Examiner. 
      You will receive an audio recording for the stage: ${stageType.replace('_', ' ')}.
      Language: ${selectedLanguage.name}.
      
      TASK CONTEXT: "${context}"
      
      EVALUATION CRITERIA:
      ${criteria}
      
      Your goal is to provide a fair score (0-100) and constructive feedback.
      Ensure the feedback addresses the specific criteria mentioned above.
      The feedback MUST be in ${selectedLanguage.name} (the same language the user is learning).
      
      Respond ONLY in JSON format: 
      { 
        "score": number, 
        "feedback": "string explaining the score and performance", 
        "transcription": "accurate text of what the user said" 
      }`;

      const generateWithRetry = async (retryCount = 0): Promise<any> => {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-3-flash-preview",
            contents: [
              {
                parts: [
                  { text: "Evaluate this speaking performance JSON response." },
                  { inlineData: { mimeType: "audio/webm", data: base64Audio } }
                ]
              }
            ],
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  score: { type: Type.NUMBER },
                  feedback: { type: Type.STRING },
                  transcription: { type: Type.STRING }
                },
                required: ["score", "feedback", "transcription"]
              }
            }
          });
          const resText = response.text || '';
          if (!resText || resText === 'undefined') {
              throw new Error("AI returned empty performance evaluation.");
          }
          try {
            return JSON.parse(resText.replace(/```(json)?/gi, '').trim());
          } catch (parseError) {
             console.error("Failed to parse evaluation response:", resText, parseError);
             throw new Error("AI returned malformed evaluation data.");
          }
        } catch (e: any) {
          if (isRateLimitError(e) && retryCount < 3) {
            await wait(Math.pow(2, retryCount) * 2000);
            return generateWithRetry(retryCount + 1);
          }
          throw e;
        }
      };

      const result = await generateWithRetry();
      return result;
    } catch (e) {
      console.error("Evaluation Error:", e);
      return { score: 0, feedback: "Evaluation failed. Please check your internet connection and try again.", transcription: "" };
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleStageComplete = async () => {
    const audioBlob = await stopRecording();
    if (audioBlob.size === 0) {
      setError("No audio recorded. Please try again.");
      return;
    }

    let result;
    if (stage === 'read_aloud') {
      result = await evaluateStage(audioBlob, 'read_aloud', readAloudItems[subStep].text);
      // Accumulate scores for Read Aloud (it's 2 sentences)
      const currentScores = (scores.readAloud?.score || 0) * subStep;
      const newAvgScore = (currentScores + result.score) / (subStep + 1);
      setScores(prev => ({ ...prev, readAloud: { score: newAvgScore, feedback: result.feedback } }));

      if (subStep < 1) {
        setSubStep(prev => prev + 1);
        return;
      }
    } else if (stage === 'repeat') {
      result = await evaluateStage(audioBlob, 'repeat', repeatItems[subStep]);
      const currentScoresValue = (scores.repeat?.score || 0) * subStep;
      const newAvgScoreValue = (currentScoresValue + result.score) / (subStep + 1);
      setScores(prev => ({ ...prev, repeat: { score: newAvgScoreValue, feedback: result.feedback } }));

      if (subStep < 2) {
        setSubStep(prev => prev + 1);
        return;
      }
    } else if (stage === 'description') {
      result = await evaluateStage(audioBlob, 'description', descriptionTopic);
      setScores(prev => ({ ...prev, description: result }));
    } else if (stage === 'opinion') {
      result = await evaluateStage(audioBlob, 'opinion', opinionQuestion);
      setScores(prev => ({ ...prev, opinion: result }));
    }

    // Move to next stage
    setSubStep(0);
    if (stage === 'read_aloud') setStage('repeat');
    else if (stage === 'repeat') setStage('description');
    else if (stage === 'description') setStage('opinion');
    else if (stage === 'opinion') {
      finalizeResults();
    }
  };

  const finalizeResults = async () => {
    setIsEvaluating(true);
    setStage('results');
    try {
      // Use another Gemini call to synthesize all scores into a final report
      const systemInstruction = `Synthesize these speaking assessment scores into a final CEFR report for the user. 
      Scores: ${JSON.stringify(scores)}
      
      Respond only with JSON: { 
        "overallScore": number (0-100), 
        "cefrLevel": "A1-C2", 
        "strengths": ["string", "string", "string"], 
        "improvements": ["string", "string", "string"], 
        "recommendation": "string" 
      }`;

      const synthesizeWithRetry = async (retryCount = 0): Promise<any> => {
        try {
          const response = await ai.models.generateContent({
            model: "gemini-flash-latest",
            contents: "Synthesize these results.",
            config: {
              systemInstruction,
              responseMimeType: "application/json",
              responseSchema: {
                type: Type.OBJECT,
                properties: {
                  overallScore: { type: Type.NUMBER },
                  cefrLevel: { type: Type.STRING },
                  strengths: { type: Type.ARRAY, items: { type: Type.STRING } },
                  improvements: { type: Type.ARRAY, items: { type: Type.STRING } },
                  recommendation: { type: Type.STRING }
                },
                required: ["overallScore", "cefrLevel", "strengths", "improvements", "recommendation"]
              }
            }
          });
          const finalResText = response.text || '';
          if (!finalResText || finalResText === 'undefined') {
              throw new Error("AI returned empty final synthesis.");
          }
          try {
            return JSON.parse(finalResText.replace(/```(json)?/gi, '').trim());
          } catch (parseError) {
             console.error("Failed to parse final synthesis:", finalResText, parseError);
             throw new Error("AI returned malformed synthesis data.");
          }
        } catch (e: any) {
          if ((e?.status === 429 || e?.message?.includes('429')) && retryCount < 2) {
            await new Promise(resolve => setTimeout(resolve, Math.pow(2, retryCount) * 1000));
            return synthesizeWithRetry(retryCount + 1);
          }
          throw e;
        }
      };

      const result = await synthesizeWithRetry();
      setScores(prev => ({ ...prev, ...result }));
    } catch (e) {
      console.error("Finalization Error:", e);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleShare = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw Result Card
    ctx.fillStyle = '#0A192F';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = '#64FFDA';
    ctx.font = 'bold 40px Inter';
    ctx.fillText('FLUENTO ASSESSMENT', 50, 80);
    
    ctx.fillStyle = 'white';
    ctx.font = '24px Inter';
    ctx.fillText(`Candidate: ${user.fullName}`, 50, 130);
    ctx.fillText(`Overall Score: ${scores.overallScore}/100`, 50, 170);
    ctx.fillText(`CEFR Level: ${scores.cefrLevel}`, 50, 210);
    
    ctx.fillStyle = '#48CAE4';
    ctx.fillText('Breakdown:', 50, 270);
    ctx.fillStyle = 'white';
    ctx.font = '18px Inter';
    ctx.fillText(`Read Aloud: ${Math.round(scores.readAloud?.score || 0)}`, 70, 310);
    ctx.fillText(`Repeat Phrases: ${Math.round(scores.repeat?.score || 0)}`, 70, 340);
    ctx.fillText(`Description: ${Math.round(scores.description?.score || 0)}`, 70, 370);
    ctx.fillText(`Opinion: ${Math.round(scores.opinion?.score || 0)}`, 70, 400);

    // Convert to Image and download or share
    const dataUrl = canvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'fluento-result.png';
    link.href = dataUrl;
    link.click();
  };

  const renderStageContent = () => {
    switch (stage) {
      case 'intro':
        return (
          <div className="text-center max-w-2xl mx-auto space-y-6">
            <div className="p-4 bg-sky-cyan/10 rounded-full w-20 h-20 flex items-center justify-center mx-auto mb-6">
              <GraduationCap size={48} className="text-sky-cyan" />
            </div>
            <h2 className="text-3xl font-bold text-electric-blue">Expert Speaking Assessment</h2>
            <p className="text-gray-400">
              Welcome to the Fluento Speaking Assessment. This test will evaluate your English speaking skills across four critical areas. 
              Our AI will analyze your pronunciation, fluency, and vocabulary to estimate your CEFR level.
            </p>
            <div className="grid grid-cols-2 gap-4 text-left">
              {[
                "Stage 1: Read Aloud",
                "Stage 2: Repeat Phrases",
                "Stage 3: Topic Description",
                "Stage 4: Opinion Question"
              ].map((s, i) => (
                <div key={i} className="flex items-center gap-2 p-3 bg-slate-blue rounded-lg border border-sky-cyan/10">
                  <CheckCircle2 size={18} className="text-sky-cyan" />
                  <span className="text-sm font-medium">{s}</span>
                </div>
              ))}
            </div>
            <button 
              onClick={() => setStage('read_aloud')}
              className="w-full py-4 bg-electric-blue text-deep-navy font-bold rounded-xl hover:scale-[1.02] transition-transform shadow-lg"
            >
              Start My Assessment
            </button>
          </div>
        );
      case 'read_aloud':
        return (
          <div className="space-y-8 animate-fade-in-up">
             <div className="flex justify-between items-center">
                <span className="text-sky-cyan font-semibold uppercase tracking-widest text-sm">Stage 1: Read Aloud</span>
                <span className="bg-slate-blue px-3 py-1 rounded-full text-xs text-gray-400 border border-sky-cyan/20">Task {subStep + 1}/2</span>
             </div>
             <div className="bg-slate-blue p-10 rounded-3xl border border-sky-cyan/20 text-center shadow-2xl">
               <p className="text-2xl font-medium leading-relaxed italic text-white">
                 "{readAloudItems[subStep]?.text}"
               </p>
             </div>
             <div className="flex flex-col items-center gap-6">
               <p className="text-gray-400 text-sm">Read the sentence above clearly and at a natural pace.</p>
               {status === Status.LISTENING ? (
                 <div className="flex flex-col items-center gap-4">
                    <button 
                      onClick={handleStageComplete}
                      className="w-20 h-20 bg-crimson-red rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all outline outline-offset-4 outline-crimson-red/30"
                    >
                      <MicOff size={32} className="text-white" />
                    </button>
                    <div className="flex items-center gap-2 text-crimson-red animate-pulse">
                      <div className="w-2 h-2 rounded-full bg-crimson-red"></div>
                      <span className="font-mono">{Math.floor(recordingSeconds / 60)}:{(recordingSeconds % 60).toString().padStart(2, '0')}</span>
                    </div>
                 </div>
               ) : (
                 <button 
                  onClick={startRecording}
                  disabled={isEvaluating}
                  className="w-20 h-20 bg-electric-blue rounded-full flex items-center justify-center shadow-lg hover:scale-105 transition-all text-deep-navy disabled:opacity-50"
                 >
                   <Mic size={32} />
                 </button>
               )}
               {isEvaluating && <div className="flex items-center gap-2 text-sky-cyan"><BrainCircuit className="animate-spin" /> Evaluating your response...</div>}
             </div>
          </div>
        );
      case 'repeat':
        return (
          <div className="space-y-8 animate-fade-in-up">
             <div className="flex justify-between items-center">
                <span className="text-sky-cyan font-semibold uppercase tracking-widest text-sm">Stage 2: Repeat After AI</span>
                <span className="bg-slate-blue px-3 py-1 rounded-full text-xs text-gray-400 border border-sky-cyan/20">Task {subStep + 1}/3</span>
             </div>
             <div className="bg-slate-blue p-10 rounded-3xl border border-sky-cyan/20 text-center shadow-2xl flex flex-col items-center gap-6">
               <div className="w-16 h-16 bg-sky-cyan/10 rounded-full flex items-center justify-center">
                 <Volume2 size={32} className="text-sky-cyan" />
               </div>
               <p className="text-xl text-gray-400">Listen to the phrase, then repeat it exactly as you heard it.</p>
               <button 
                onClick={() => playTTS(repeatItems[subStep])}
                className="flex items-center gap-2 px-6 py-2 bg-user-bubble rounded-full hover:bg-sky-cyan/20 transition-colors text-sky-cyan border border-sky-cyan/30"
               >
                 <Play size={18} /> Play AI Audio
               </button>
             </div>
             <div className="flex flex-col items-center gap-6">
               {status === Status.LISTENING ? (
                 <button 
                  onClick={handleStageComplete}
                  className="w-20 h-20 bg-crimson-red rounded-full flex items-center justify-center"
                 >
                   <MicOff size={32} className="text-white" />
                 </button>
               ) : (
                 <button 
                  onClick={startRecording}
                  disabled={isEvaluating}
                  className="w-20 h-20 bg-electric-blue rounded-full flex items-center justify-center text-deep-navy disabled:opacity-50"
                 >
                   <Mic size={32} />
                 </button>
               )}
               {isEvaluating && <div className="flex items-center gap-2 text-sky-cyan"><BrainCircuit className="animate-spin" /> Analyzing match...</div>}
             </div>
          </div>
        );
      case 'description':
        return (
          <div className="space-y-8 animate-fade-in-up">
             <div className="flex justify-between items-center">
                <span className="text-sky-cyan font-semibold uppercase tracking-widest text-sm">Stage 3: Picture Description</span>
                <span className="bg-slate-blue px-3 py-1 rounded-full text-xs text-gray-400 border border-sky-cyan/20">60 Seconds Task</span>
             </div>
             <div className="bg-slate-blue p-10 rounded-3xl border border-sky-cyan/20 text-center shadow-2xl">
               <h3 className="text-lg text-sky-cyan mb-4 uppercase tracking-tighter">Topic Prompt</h3>
               <p className="text-2xl font-bold text-white leading-relaxed">
                 {descriptionTopic}
               </p>
             </div>
             <div className="flex flex-col items-center gap-6">
               <p className="text-gray-400 text-sm text-center max-w-sm">Speak freely for about 60 seconds. Describe the scenario in as much detail as possible.</p>
               {status === Status.LISTENING ? (
                 <div className="flex flex-col items-center gap-4">
                    <button 
                      onClick={handleStageComplete}
                      className="w-24 h-24 bg-crimson-red rounded-full flex items-center justify-center animate-pulse"
                    >
                      <MicOff size={40} className="text-white" />
                    </button>
                    <div className="flex items-center gap-2 text-crimson-red text-xl font-bold">
                      <Timer />
                      <span className="font-mono">{60 - recordingSeconds > 0 ? `0:${(60 - recordingSeconds).toString().padStart(2, '0')}` : 'Times up!'}</span>
                    </div>
                    <div className="w-64 h-2 bg-deep-navy rounded-full overflow-hidden border border-sky-cyan/10">
                      <motion.div 
                        initial={{ width: '0%' }}
                        animate={{ width: `${Math.min((recordingSeconds / 60) * 100, 100)}%` }}
                        className="h-full bg-crimson-red"
                      ></motion.div>
                    </div>
                 </div>
               ) : (
                 <button 
                  onClick={startRecording}
                  disabled={isEvaluating}
                  className="w-24 h-24 bg-electric-blue rounded-full flex items-center justify-center text-deep-navy disabled:opacity-50"
                 >
                   <Mic size={40} />
                 </button>
               )}
               {isEvaluating && <div className="flex items-center gap-2 text-sky-cyan"><BrainCircuit className="animate-spin" /> Evaluating vocabulary...</div>}
             </div>
          </div>
        );
      case 'opinion':
        return (
          <div className="space-y-8 animate-fade-in-up">
             <div className="flex justify-between items-center">
                <span className="text-sky-cyan font-semibold uppercase tracking-widest text-sm">Stage 4: Opinion Question</span>
                <span className="bg-slate-blue px-3 py-1 rounded-full text-xs text-gray-400 border border-sky-cyan/20">90 Seconds Task</span>
             </div>
             <div className="bg-slate-blue p-10 rounded-3xl border border-sky-cyan/20 text-center shadow-2xl space-y-6">
               <h3 className="text-lg text-sky-cyan uppercase tracking-tighter">AI Question</h3>
               <div className="flex justify-center">
                  <button 
                    onClick={() => playTTS(opinionQuestion)}
                    className="p-4 bg-sky-cyan/10 rounded-full hover:bg-sky-cyan/20 transition-all text-sky-cyan mb-2"
                  >
                    <Volume2 size={32} />
                  </button>
               </div>
               <p className="text-2xl font-bold text-white leading-relaxed">
                 {opinionQuestion}
               </p>
             </div>
             <div className="flex flex-col items-center gap-6">
               <p className="text-gray-400 text-sm text-center max-w-sm">Structure your answer with an introduction, supporting points, and a conclusion. Speak for up to 90 seconds.</p>
               {status === Status.LISTENING ? (
                 <div className="flex flex-col items-center gap-4">
                    <button 
                      onClick={handleStageComplete}
                      className="w-24 h-24 bg-crimson-red rounded-full flex items-center justify-center animate-pulse"
                    >
                      <MicOff size={40} className="text-white" />
                    </button>
                    <div className="flex items-center gap-2 text-crimson-red text-xl font-bold">
                      <Timer />
                      <span className="font-mono">
                        {90 - recordingSeconds > 0 
                          ? `${Math.floor((90 - recordingSeconds) / 60)}:${((90 - recordingSeconds) % 60).toString().padStart(2, '0')}` 
                          : 'Times up!'}
                      </span>
                    </div>
                    <div className="w-64 h-2 bg-deep-navy rounded-full overflow-hidden border border-sky-cyan/10">
                      <motion.div 
                        initial={{ width: '0%' }}
                        animate={{ width: `${Math.min((recordingSeconds / 90) * 100, 100)}%` }}
                        className="h-full bg-crimson-red"
                      ></motion.div>
                    </div>
                 </div>
               ) : (
                 <button 
                  onClick={startRecording}
                  disabled={isEvaluating}
                  className="w-24 h-24 bg-electric-blue rounded-full flex items-center justify-center text-deep-navy disabled:opacity-50"
                 >
                   <Mic size={40} />
                 </button>
               )}
               {isEvaluating && <div className="flex items-center gap-2 text-sky-cyan"><BrainCircuit className="animate-spin" /> Analyzing coherence...</div>}
             </div>
          </div>
        );
      case 'results':
        return (
          <div className="space-y-6 animate-fade-in-up max-w-4xl mx-auto pb-10">
            <div className="bg-slate-blue/50 p-8 rounded-3xl border border-sky-cyan/20 flex flex-col md:flex-row items-center gap-8 shadow-2xl relative overflow-hidden">
               {/* Background Decorative */}
               <div className="absolute top-0 right-0 w-64 h-64 bg-sky-cyan/5 rounded-full blur-3xl -mr-20 -mt-20"></div>
               
               <div className="relative">
                  <div className="w-32 h-32 rounded-full border-4 border-sky-cyan flex items-center justify-center bg-deep-navy">
                     <span className="text-4xl font-bold text-white">{scores.overallScore}</span>
                  </div>
                  <div className="absolute -bottom-2 -right-2 bg-electric-blue text-deep-navy font-bold px-4 py-1 rounded-full text-xl shadow-lg border-2 border-deep-navy">
                    {scores.cefrLevel}
                  </div>
               </div>
               
               <div className="flex-1 text-center md:text-left space-y-2">
                  <h2 className="text-3xl font-bold text-electric-blue">Assessment Complete!</h2>
                  <p className="text-gray-400">Excellent effort! You have clearly demonstrated your speaking capabilities. Below is your detailed breakdown and improvement plan.</p>
                  <div className="flex flex-wrap gap-4 pt-4">
                    <button 
                      onClick={handleShare}
                      className="flex items-center gap-2 px-6 py-2 bg-sky-cyan text-deep-navy font-bold rounded-full hover:opacity-90 transition-all"
                    >
                      <Share2 size={18} /> Share Result
                    </button>
                    <button 
                      onClick={() => initAssessment(0)}
                      className="flex items-center gap-2 px-6 py-2 bg-slate-blue text-off-white font-medium rounded-full hover:bg-user-bubble transition-all border border-sky-cyan/30"
                    >
                      <RefreshCcw size={18} /> Take Again
                    </button>
                  </div>
               </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
               <div className="bg-slate-blue p-6 rounded-2xl border border-sky-cyan/10">
                  <h3 className="text-electric-blue font-bold mb-4 flex items-center gap-2"><Award size={20}/> Performance Breakdown</h3>
                  <div className="space-y-4">
                     {[
                       { label: 'Read Aloud', score: scores.readAloud?.score },
                       { label: 'Repeat After AI', score: scores.repeat?.score },
                       { label: 'Topic Description', score: scores.description?.score },
                       { label: 'Opinion Question', score: scores.opinion?.score }
                     ].map((item, id) => (
                       <div key={id}>
                         <div className="flex justify-between text-sm mb-1">
                           <span className="text-gray-300">{item.label}</span>
                           <span className="text-sky-cyan font-bold">{Math.round(item.score || 0)}/100</span>
                         </div>
                         <div className="w-full h-2 bg-deep-navy rounded-full overflow-hidden">
                           <div 
                             className="h-full bg-sky-cyan rounded-full transition-all duration-1000"
                             style={{ width: `${item.score || 0}%` }}
                           ></div>
                         </div>
                       </div>
                     ))}
                  </div>
               </div>

               <div className="bg-slate-blue p-6 rounded-2xl border border-sky-cyan/10">
                  <h3 className="text-electric-blue font-bold mb-4 flex items-center gap-2"><CheckCircle2 size={20}/> Core Strengths</h3>
                  <ul className="space-y-3">
                    {scores.strengths?.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <CheckCircle2 size={16} className="text-aqua-green mt-0.5 flex-shrink-0" />
                        {s}
                      </li>
                    ))}
                  </ul>
               </div>

               <div className="bg-slate-blue p-6 rounded-2xl border border-sky-cyan/10">
                  <h3 className="text-crimson-red font-bold mb-4 flex items-center gap-2"><AlertCircle size={20}/> Areas to Improve</h3>
                  <ul className="space-y-3">
                    {scores.improvements?.map((s, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-gray-300">
                        <div className="w-4 h-4 rounded-full bg-crimson-red/20 flex items-center justify-center mt-0.5 flex-shrink-0">
                           <div className="w-1.5 h-1.5 rounded-full bg-crimson-red"></div>
                        </div>
                        {s}
                      </li>
                    ))}
                  </ul>
               </div>

               <div className="bg-sky-cyan/5 p-6 rounded-2xl border border-sky-cyan/20">
                  <h3 className="text-sky-cyan font-bold mb-2">Recommended Practice</h3>
                  <p className="text-sm text-gray-300 leading-relaxed">{scores.recommendation}</p>
                  <button 
                    onClick={() => window.location.reload()}
                    className="mt-4 text-electric-blue text-sm font-bold flex items-center gap-1 hover:underline"
                  >
                    Go to practice mode <ChevronRight size={14} />
                  </button>
               </div>
            </div>
            {/* Hidden Canvas for Generation */}
            <canvas ref={canvasRef} width={800} height={500} className="hidden" />
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex-1 flex flex-col h-full bg-deep-navy overflow-y-auto">
      <header className="p-6 border-b border-sky-cyan/20 bg-slate-blue/80 backdrop-blur-sm relative overflow-hidden">
        <div className="absolute top-0 right-0 w-32 h-32 bg-sky-cyan/5 rounded-full blur-2xl"></div>
        <div className="relative">
          <h1 className="text-2xl font-bold text-electric-blue flex items-center gap-2">
             <GraduationCap className="text-sky-cyan" />
             Speaking Assessment
          </h1>
          <p className="text-gray-400">Formal proficiency testing powered by Gemini AI</p>
        </div>
      </header>

      <main className="flex-1 p-6 flex flex-col">
        {error && (
          <div className="mb-6 p-4 bg-crimson-red/20 border border-crimson-red/30 rounded-xl flex items-center gap-3 animate-fade-in-up">
            <AlertCircle className="text-crimson-red" />
            <p className="text-crimson-red text-sm font-medium">{error}</p>
            <button onClick={() => setError(null)} className="ml-auto text-crimson-red/60 hover:text-crimson-red">✕</button>
          </div>
        )}

        <div className="flex-1 flex flex-col items-center justify-center py-10">
          {renderStageContent()}
        </div>
      </main>
    </div>
  );
};

export default AssessmentPage;
