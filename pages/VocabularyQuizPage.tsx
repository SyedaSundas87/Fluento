
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ArrowLeft, 
  Mic, 
  MicOff, 
  CheckCircle, 
  XCircle, 
  Trophy, 
  RotateCcw, 
  BookOpen, 
  Volume2,
  Sparkles,
  Loader2,
  ChevronRight
} from 'lucide-react';
import { GoogleGenAI, Type } from '@google/genai';
import { type VocabularyWord, type Language, type User } from '../types';
import { useLanguage, useTranslations } from '../hooks/useLanguage';
import { LANGUAGE_CONFIG } from '../utils/languageConfig';

interface QuizResult {
  word: string;
  definition: string;
  userAnswer: string;
  correct: boolean;
  answerMethod: 'typed' | 'voice' | 'skipped';
  justification?: string;
}

type QuizPhase = 
  'READY'        // before quiz starts - show instructions
  | 'QUESTION'   // showing current question, waiting for answer
  | 'GRADING'    // AI grading is happening
  | 'FEEDBACK'   // showing correct/wrong for 1.5 seconds
  | 'COMPLETE';   // final score screen

interface VocabularyQuizPageProps {
  user: User;
  selectedLanguage: Language;
  words: VocabularyWord[];
  onExit: () => void;
  onNewWords: () => void;
}

// JAVASCRIPT ONLY UTILS
function normalizeWord(input: string, langCode?: string): string {
  let normalized = input.toLowerCase().trim();
  
  if (langCode === 'en') {
    return normalized
      .replace(/[^a-z\s]/g, '')      // remove punctuation and numbers
      .replace(/\s+/g, ' ')          // collapse multiple spaces
      .replace(/ing$/, '')            // remove -ing suffix
      .replace(/tion$/, '')           // remove -tion suffix  
      .replace(/ed$/, '')             // remove -ed suffix
      .replace(/ly$/, '')             // remove -ly suffix
      .replace(/s$/, '')              // remove plural s
      .trim();
  }

  // Support all Unicode word characters (letters and numbers)
  try {
    return normalized
      .replace(/[^\p{L}\p{N}\s]/gu, '')
      .replace(/\s+/g, ' ')
      .trim();
  } catch (e) {
    // Fallback for older environments that don't support \p{L}
    return normalized
      .replace(/[^\w\s\u0600-\u06FF\u0750-\u077F\u4e00-\u9fa5]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];
  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }
  return matrix[b.length][a.length];
}

async function verifyAnswerWithAI(userInput: string, correctWord: string, langName: string): Promise<{ correct: boolean, justification: string }> {
  const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
  if (!apiKey) return { correct: false, justification: "API key missing" };
  
  try {
    const ai = new GoogleGenAI({ apiKey });
    const prompt = `
      Language context: Studying ${langName}.
      Target correct word/phrase: "${correctWord}"
      User input: "${userInput}"
      
      The user is taking a vocabulary quiz. Determine if the user's input is a correct match for the target word.
      MANDATORY RULES:
      1. Allow for minor typos (e.g., one missing accent or letter).
      2. Allow for exact synonyms in ${langName}.
      3. For Arabic/Urdu, ignore character variations like Alef with/without Hamza, or different forms of 'He'.
      4. If the input is fundamentally a different word or meaning, mark it as FALSE.
      
      Respond only with a JSON object:
      {
        "correct": true or false,
        "justification": "A very short one-sentence explanation in English why it is correct or incorrect."
      }
    `;

    const result = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            correct: { type: Type.BOOLEAN },
            justification: { type: Type.STRING }
          },
          required: ["correct", "justification"]
        }
      }
    });

    const resultText = result.text || '';
    if (!resultText || resultText === 'undefined') {
       return { correct: false, justification: "AI returned empty grading result." };
    }
    const data = JSON.parse(resultText.replace(/```(json)?/gi, '').trim());
    return {
      correct: data.correct === true,
      justification: data.justification || ""
    };
  } catch (e) {
    console.error("AI grading error:", e);
    return { correct: false, justification: "Error during AI verification" };
  }
}

async function checkAnswer(userInput: string, correctWord: string, langCode: string, langName: string): Promise<{ correct: boolean, justification: string }> {
  if (!userInput || userInput.trim() === '') return { correct: false, justification: "" };
  
  const normalized_input = normalizeWord(userInput, langCode);
  const normalized_correct = normalizeWord(correctWord, langCode);
  
  // 1. Fast exact match
  if (normalized_input === normalized_correct && normalized_input !== '') {
    return { correct: true, justification: "Exact match found." };
  }
  
  // 2. Strict inclusion check (only for phrases/sentences)
  if (normalized_correct.split(' ').length > 2 && normalized_input.length > 5) {
     if (normalized_input === normalized_correct) return { correct: true, justification: "Phrase matches." };
  }
  
  // 3. Typo tolerance (Levenshtein) - only for languages with simple alphabets
  const isSimpleScript = ['en', 'es', 'fr', 'de'].includes(langCode.substring(0, 2));
  if (isSimpleScript && normalized_correct.length > 5 && normalized_input !== '') {
    if (levenshteinDistance(normalized_input, normalized_correct) <= 1) {
      return { correct: true, justification: "Minor typo corrected." };
    }
  }
  
  // 4. AI Verification Fallback (Always for non-English/Complex, or if we suspect it's close)
  return await verifyAnswerWithAI(userInput, correctWord, langName);
}

const VocabularyQuizPage: React.FC<VocabularyQuizPageProps> = ({ 
  user,
  selectedLanguage,
  words,
  onExit,
  onNewWords
}) => {
  const t = useTranslations();
  const currentLanguage = useLanguage();
  const langConfig = LANGUAGE_CONFIG[currentLanguage] || LANGUAGE_CONFIG['English'];

  const [phase, setPhase] = useState<QuizPhase>('READY');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<QuizResult[]>([]);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [lastAnswerCorrect, setLastAnswerCorrect] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState(30);
  const [isTimerActive, setIsTimerActive] = useState(false);
  const [aiSummary, setAiSummary] = useState('');
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);

  // Auto-focus input when entering QUESTION phase
  useEffect(() => {
    if (phase === 'QUESTION') {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [phase, currentIndex]);

  // Timer Logic
  useEffect(() => {
    if (phase !== 'QUESTION' || !isTimerActive) return;
    
    if (timeLeft === 0) {
      handleSubmitAnswer('', 'skipped');
      return;
    }
    
    timerRef.current = setTimeout(() => {
      setTimeLeft(prev => prev - 1);
    }, 1000);
    
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [timeLeft, phase, isTimerActive]);

  const handleSubmitAnswer = async (
    answer: string, 
    method: 'typed' | 'voice' | 'skipped'
  ) => {
    // Stop timer
    setIsTimerActive(false);
    if (timerRef.current) clearTimeout(timerRef.current);
    
    // Stop voice recognition if active
    stopVoiceInput();
    
    setPhase('GRADING');
    
    const currentWord = words[currentIndex];
    const gradingResult = method === 'skipped' 
      ? { correct: false, justification: "" }
      : await checkAnswer(answer, currentWord.word, selectedLanguage.code, selectedLanguage.name);
    
    const result: QuizResult = {
      word: currentWord.word,
      definition: currentWord.definition,
      userAnswer: method === 'skipped' ? '(no answer)' : answer,
      correct: gradingResult.correct,
      justification: gradingResult.justification,
      answerMethod: method
    };
    
    // Update results
    const newResults = [...results, result];
    setResults(newResults);
    setLastAnswerCorrect(gradingResult.correct);
    setPhase('FEEDBACK');
    
    // After 1.5 seconds move to next question or end quiz
    setTimeout(() => {
      if (currentIndex >= words.length - 1) {
        setPhase('COMPLETE');
        fetchAiSummary(newResults);
      } else {
        setCurrentIndex(prev => prev + 1);
        setTypedAnswer('');
        setLastAnswerCorrect(null);
        setPhase('QUESTION');
        setTimeLeft(30);
        setIsTimerActive(true);
      }
    }, 1500);
  };

  const startVoiceInput = () => {
    if (!navigator.onLine) {
      setError('You are offline. Please check your internet connection to use voice input.');
      return;
    }

    const SpeechRecognition = 
      (window as any).SpeechRecognition || 
      (window as any).webkitSpeechRecognition;
    
    if (!SpeechRecognition || !langConfig.speechSupported) {
      setError(t.quiz_voice_not_supported);
      return;
    }
    
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch (e) { /* ignore */ }
    }
    
    setError(null);
    const recognition = new SpeechRecognition();
    
    recognition.lang = langConfig.speechCode;
    recognition.continuous = false;
    recognition.interimResults = true;
    recognition.maxAlternatives = 3;
    
    recognition.onstart = () => {
      setIsListening(true);
      setError(null);
      setTypedAnswer('');
    };
    
    recognition.onresult = (event: any) => {
      const transcript = event.results[0][0].transcript;
      setTypedAnswer(transcript);
      
      if (event.results[0].isFinal) {
        const alternatives = Array.from(event.results[0])
          .map((alt: any) => alt.transcript);
        
        const currentWord = words[currentIndex].word;
        const bestMatch = alternatives.reduce((best: string, alt: unknown) => {
          const alternate = alt as string;
          const bestScore = levenshteinDistance(
            normalizeWord(best), normalizeWord(currentWord)
          );
          const altScore = levenshteinDistance(
            normalizeWord(alternate), normalizeWord(currentWord)
          );
          return altScore < bestScore ? alternate : best;
        }, alternatives[0] as string);
        
        setTypedAnswer(bestMatch);
        recognitionRef.current = null;
        setIsListening(false);
        handleSubmitAnswer(bestMatch, 'voice');
      }
    };
    
    recognition.onerror = (event: any) => {
      setIsListening(false);
      
      const errorType = event.error;
      
      if (errorType === 'no-speech') {
        // Just stop quietly
      } else if (errorType === 'network') {
        setError('Network Error: Your browser lost connection to its voice recognition service. This usually happens on weak internet. Try typing your answer instead.');
      } else if (errorType === 'not-allowed' || errorType === 'service-not-allowed') {
        setError('Microphone access denied or service unavailable. Please check browser permissions.');
      } else if (errorType === 'aborted') {
        // Silently ignore aborted sessions
      } else {
        setError(`Voice input failed (${errorType}). Please use the keyboard.`);
        console.error("Speech Recognition Error (Other):", errorType);
      }
      
      setTimeout(() => setError(null), 6000);
    };
    
    recognition.onend = () => {
      setIsListening(false);
    };
    
    recognitionRef.current = recognition;
    recognition.start();
  };

  const stopVoiceInput = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const startQuiz = () => {
    setCurrentIndex(0);
    setResults([]);
    setTypedAnswer('');
    setPhase('QUESTION');
    setTimeLeft(30);
    setIsTimerActive(true);
  };

  async function fetchAiSummary(finalResults: QuizResult[]) {
    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    if (!apiKey) return;
    setLoadingSummary(true);
    
    const score = finalResults.filter(r => r.correct).length;
    const wrongWords = finalResults
      .filter(r => !r.correct)
      .map(r => r.word)
      .join(', ');
    
    const prompt = currentLanguage === 'English' ? `
      A student just completed a vocabulary quiz and scored ${score} out of ${finalResults.length}.
      Words they got wrong: ${wrongWords || 'none'}
      
      Write a short 2-sentence encouraging message for this student.
      First sentence: acknowledge their score positively.
      Second sentence: give one specific tip about the words they missed, or congratulate them if they got everything right.
      
      Keep it friendly, encouraging, and under 50 words total. Plain text only.
    ` : `
      A student scored ${score} out of ${finalResults.length} on a vocabulary quiz.
      Wrong words: ${wrongWords || 'none'}
      
      Write a short 2-sentence encouraging message in ${currentLanguage}.
      Use ${currentLanguage} script (not romanized).
      Keep it under 40 words.
      Plain text only, no formatting.
    `;
    
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      const result = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt
      });
      const text = result.text || '';
      setAiSummary(text);
    } catch (error) {
      console.error("AI Summary Error:", error);
      setAiSummary('');
    } finally {
      setLoadingSummary(false);
    }
  }

  // --- RENDERING ---
  if (!words || words.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-deep-navy">
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-slate-blue border border-sky-cyan/20 p-8 rounded-3xl shadow-2xl text-center max-w-lg w-full"
        >
          <div className="w-20 h-20 bg-electric-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <BookOpen size={40} className="text-sky-cyan" />
          </div>
          <h2 className="text-2xl font-bold text-off-white mb-2">No words found for today</h2>
          <p className="text-gray-400 mb-8">Please visit the Vocabulary section first to fetch your daily words before starting a quiz.</p>
          <button 
            onClick={onExit}
            className="w-full py-4 bg-electric-blue text-deep-navy font-bold rounded-xl shadow-lg hover:brightness-110 active:scale-95 transition-all"
          >
            Go to Daily Vocabulary
          </button>
        </motion.div>
      </div>
    );
  }

  if (phase === 'READY') {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-6 bg-deep-navy" dir={langConfig.rtl ? 'rtl' : 'ltr'}>
        <motion.div 
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="bg-slate-blue border border-sky-cyan/20 p-8 rounded-3xl shadow-2xl text-center max-w-lg w-full"
        >
          <div className="w-20 h-20 bg-electric-blue/10 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <Trophy size={40} className="text-electric-blue" />
          </div>
          <h1 className="text-3xl font-bold text-off-white mb-2">{t.quiz_ready_title}</h1>
          <p className="text-gray-400 mb-8">{t.quiz_ready_subtitle}</p>
          
          <div className="space-y-4 mb-8 text-left">
            <div className={`flex items-start gap-4 p-4 bg-deep-navy/40 rounded-xl ${langConfig.rtl ? 'text-right' : 'text-left'}`}>
              <BookOpen className="text-sky-cyan shrink-0" size={20} />
              <div>
                <p className="text-off-white font-medium">{t.quiz_instruction_1}</p>
              </div>
            </div>
            <div className={`flex items-start gap-4 p-4 bg-deep-navy/40 rounded-xl ${langConfig.rtl ? 'text-right' : 'text-left'}`}>
              <Mic className="text-sky-cyan shrink-0" size={20} />
              <div>
                <p className="text-off-white font-medium">{t.quiz_instruction_2}</p>
              </div>
            </div>
            <div className={`flex items-start gap-4 p-4 bg-deep-navy/40 rounded-xl ${langConfig.rtl ? 'text-right' : 'text-left'}`}>
              <Volume2 className="text-sky-cyan shrink-0" size={20} />
              <div>
                <p className="text-off-white font-medium">{t.quiz_instruction_3}</p>
              </div>
            </div>
          </div>

          <button 
            onClick={startQuiz}
            className="w-full py-4 bg-electric-blue text-deep-navy font-bold rounded-xl shadow-lg hover:shadow-electric-blue/20 hover:brightness-110 active:scale-95 transition-all mb-4"
          >
            {t.quiz_start_button}
          </button>
          
          <button 
            onClick={onExit}
            className="text-gray-500 hover:text-sky-cyan text-sm flex items-center justify-center gap-1 mx-auto"
          >
            <ArrowLeft size={16} /> {t.quiz_back}
          </button>
        </motion.div>
      </div>
    );
  }

  if (phase === 'COMPLETE') {
    const score = results.filter(r => r.correct).length;
    const rating = score === 10 ? t.quiz_outstanding : 
                   score >= 8 ? t.quiz_excellent : 
                   score >= 6 ? t.quiz_good : 
                   score >= 4 ? t.quiz_keep_practising : t.quiz_dont_give_up;
    
    return (
      <div className="flex-1 flex flex-col p-6 bg-deep-navy overflow-y-auto" dir={langConfig.rtl ? 'rtl' : 'ltr'}>
        <div className="max-w-2xl mx-auto w-full space-y-6 pb-12 mt-8">
          <motion.div 
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="bg-slate-blue border border-sky-cyan/20 p-8 rounded-3xl shadow-2xl text-center"
          >
            <div className="relative inline-block mb-6">
              <Trophy size={80} className="text-electric-blue drop-shadow-[0_0_15px_rgba(0,186,255,0.4)]" />
              <motion.div 
                initial={{ scale: 0 }}
                animate={{ scale: 1 }}
                transition={{ delay: 0.5, type: 'spring' }}
                className="absolute -top-2 -right-2 bg-sky-cyan text-deep-navy px-3 py-1 rounded-full text-sm font-bold shadow-lg"
              >
                {t.quiz_complete_title.split('!')[0].toUpperCase()}!
              </motion.div>
            </div>
            
            <motion.h2 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-6xl font-black text-electric-blue mb-2"
            >
              <ScoreCounter end={score} total={words.length} />
            </motion.h2>
            <p className="text-2xl font-bold text-off-white mb-8">{rating}</p>
            
            {aiSummary && (
              <motion.div 
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className={`bg-deep-navy/60 p-6 rounded-2xl border border-sky-cyan/30 mb-8 relative group ${langConfig.rtl ? 'text-right' : 'text-left'}`}
              >
                <div className={`absolute -top-3 ${langConfig.rtl ? 'right-6' : 'left-6'} flex items-center gap-1.5 bg-electric-blue text-deep-navy rounded-full px-3 py-0.5 text-[10px] font-black uppercase tracking-wider`}>
                  <Sparkles size={10} /> AI Feedback
                </div>
                <p className="text-sky-cyan/90 italic leading-relaxed">"{aiSummary}"</p>
              </motion.div>
            )}

            {loadingSummary && !aiSummary && (
              <div className="bg-deep-navy/60 p-6 rounded-2xl border border-sky-cyan/10 mb-8 space-y-3">
                <div className="h-2 bg-gray-700/50 rounded-full w-3/4 animate-pulse" />
                <div className="h-2 bg-gray-700/50 rounded-full w-1/2 animate-pulse" />
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={startQuiz}
                className="flex-1 py-4 bg-electric-blue text-deep-navy font-bold rounded-xl flex items-center justify-center gap-2 hover:brightness-110 active:scale-95 transition-all"
              >
                <RotateCcw size={20} /> {t.quiz_try_again}
              </button>
              <button 
                onClick={onNewWords}
                className="flex-1 py-4 bg-slate-blue border border-sky-cyan/20 text-off-white font-bold rounded-xl flex items-center justify-center gap-2 hover:bg-sky-cyan/10 transition-colors"
              >
                <Sparkles size={20} /> {t.quiz_new_words}
              </button>
            </div>
          </motion.div>

          <div className="space-y-3">
             <div className="flex justify-between items-center px-4">
                <h3 className="text-gray-400 font-bold uppercase text-xs tracking-widest">{t.quiz_results_title}</h3>
                <div className="flex gap-4 text-xs font-medium text-gray-500">
                   <span className="flex items-center gap-1"><span className="text-[#00C896]">✓</span> {results.filter(r => r.correct).length}</span>
                   <span className="flex items-center gap-1"><span className="text-[#FF4757]">✗</span> {results.filter(r => !r.correct).length}</span>
                </div>
             </div>
             
             <div className="space-y-1">
                {results.map((res, i) => (
                  <div key={i} className="bg-slate-blue/50 p-4 rounded-xl border border-white/5 flex items-center justify-between group">
                    <div className={`flex flex-col ${langConfig.rtl ? 'items-start text-right' : 'items-start text-left'}`}>
                      <span className="text-off-white font-bold capitalize">{res.word}</span>
                      <div className="flex flex-col space-y-1 mt-1">
                        <span className="text-xs text-warm-gray italic">
                          {res.userAnswer === '(no answer)' ? t.quiz_method_skipped : `${t.quiz_your_answer_prefix} ${res.userAnswer}`}
                        </span>
                        {res.justification && (
                          <span className="text-[10px] text-sky-cyan/70 italic px-2 py-0.5 bg-sky-cyan/5 rounded border border-sky-cyan/10">
                            {res.justification}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-md ${
                        res.answerMethod === 'typed' ? 'bg-blue-500/10 text-blue-400' :
                        res.answerMethod === 'voice' ? 'bg-purple-500/10 text-purple-400' :
                        'bg-gray-500/10 text-gray-400'
                      }`}>
                        {res.answerMethod === 'typed' ? t.quiz_method_typed : 
                         res.answerMethod === 'voice' ? t.quiz_method_voice : 
                         t.quiz_method_skipped}
                      </span>
                      {res.correct ? (
                        <CheckCircle className="text-[#00C896]" size={20} />
                      ) : (
                        <XCircle className="text-[#FF4757]" size={20} />
                      )}
                    </div>
                  </div>
                ))}
             </div>
          </div>
          
          <button 
            onClick={onExit}
            className="w-full py-4 text-gray-500 hover:text-sky-cyan flex items-center justify-center gap-2 transition-colors"
          >
            <ArrowLeft size={18} /> {t.quiz_back}
          </button>
        </div>
      </div>
    );
  }

  // Question / Feedback Rendering
  const currentWord = words[currentIndex];
  
  return (
    <div className="flex-1 flex flex-col h-full bg-deep-navy relative overflow-hidden" dir={langConfig.rtl ? 'rtl' : 'ltr'}>
      {/* Quiz Header */}
      <header className="p-4 bg-slate-blue/80 backdrop-blur-sm border-b border-white/5">
        <div className="max-w-4xl mx-auto">
          <div className="flex justify-between items-center mb-4">
            <button onClick={onExit} className="text-gray-500 hover:text-white transition-colors">
              <ArrowLeft size={20} />
            </button>
            <div className="flex flex-col items-center">
              <span className="text-[10px] font-black text-sky-cyan uppercase tracking-widest mb-1">
                {t.quiz_question_label} {currentIndex + 1} {t.quiz_of_label} {words.length}
              </span>
              <div className={`flex gap-1.5 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                {Array.from({ length: words.length }).map((_, i) => (
                  <div 
                    key={i} 
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      i < results.length 
                        ? (results[i].correct ? 'bg-[#00C896]' : 'bg-[#FF4757]') 
                        : (i === currentIndex ? 'w-4 bg-sky-cyan ring-4 ring-sky-cyan/20' : 'bg-gray-700')
                    }`}
                  />
                ))}
              </div>
            </div>
            <div className="flex items-center gap-3 text-xs font-bold font-mono">
               <span className="text-[#00C896]">✓ {results.filter(r => r.correct).length}</span>
               <span className="text-[#FF4757]">✗ {results.filter(r => !r.correct).length}</span>
            </div>
          </div>
          
          {/* Progress Bar */}
          <div className="h-1 bg-white/5 rounded-full overflow-hidden">
             <motion.div 
               initial={{ width: 0 }}
               animate={{ width: `${((currentIndex + 1) / words.length) * 100}%` }}
               className="h-full bg-electric-blue shadow-[0_0_8px_rgba(41,121,255,0.5)]"
             />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-4xl mx-auto w-full flex flex-col p-6 space-y-6">
         {/* Timer and Definition Card */}
         <div className="space-y-4">
            <div className="flex flex-col items-center">
              <div className={`flex items-center gap-1.5 font-mono font-bold mb-2 ${
                timeLeft < 10 ? 'text-[#FF4757] animate-pulse' : 
                timeLeft < 20 ? 'text-amber-400' : 'text-emerald-400'
              }`}>
                <span className="text-sm">⏱</span>
                <span>{timeLeft}{t.quiz_time_left}</span>
              </div>
              <div className="w-full max-w-xs h-1 px-4">
                <div className="h-full bg-white/10 rounded-full overflow-hidden">
                   <motion.div 
                     initial={{ width: '100%' }}
                     animate={{ width: `${(timeLeft / 30) * 100}%` }}
                     className={`h-full ${
                        timeLeft < 10 ? 'bg-[#FF4757]' : 
                        timeLeft < 20 ? 'bg-amber-400' : 'bg-emerald-400'
                     }`}
                   />
                </div>
              </div>
            </div>

            <motion.div 
              key={currentIndex}
              initial={{ y: 20, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              className="bg-slate-blue border border-sky-cyan/10 p-8 rounded-3xl shadow-xl relative overflow-hidden flex flex-col items-center text-center space-y-4 min-h-[220px] justify-center"
            >
              <div className="bg-sky-cyan/5 text-sky-cyan px-2.5 py-1 rounded-md text-[10px] font-black uppercase tracking-wider mb-2">{t.quiz_instruction} (English)</div>
               <p className="text-2xl md:text-3xl font-bold text-off-white leading-tight">
                  "{currentWord.definition}"
               </p>
               {currentWord.example && (
                 <p className="text-gray-500 italic text-sm mt-2">
                   "Example: {currentWord.example.replace(new RegExp(currentWord.word, 'gi'), '_____')}"
                 </p>
               )}
            </motion.div>
         </div>

         {/* Answer Section */}
         <div className="space-y-6">
            <div className="flex gap-2">
              <div className="flex-1 relative group">
                <input 
                  ref={inputRef}
                  type="text"
                  placeholder={t.quiz_type_placeholder}
                  value={typedAnswer}
                  onChange={(e) => setTypedAnswer(e.target.value)}
                  disabled={phase !== 'QUESTION'}
                  onKeyDown={(e) => e.key === 'Enter' && typedAnswer.trim() && phase === 'QUESTION' && handleSubmitAnswer(typedAnswer, 'typed')}
                  className={`w-full bg-deep-navy border border-white/10 focus:border-electric-blue rounded-2xl py-4 ${langConfig.rtl ? 'pr-6 pl-16' : 'pl-6 pr-16'} text-off-white outline-none transition-all shadow-inner placeholder:text-gray-600 focus:shadow-[0_0_20px_rgba(41,121,255,0.15)]`}
                />
                <span className={`absolute ${langConfig.rtl ? 'left-4' : 'right-4'} top-1/2 -translate-y-1/2 text-[10px] font-mono font-bold text-gray-700 pointer-events-none uppercase`}>
                   {typedAnswer.length} chars
                </span>
                <div className={`mt-2 text-xs text-gray-500 ${langConfig.rtl ? 'text-right' : 'text-left'}`}>
                  {t.quiz_keyboard_hint}
                </div>
              </div>
              
              {langConfig.speechSupported && (
                <div className="flex flex-col items-center relative">
                  <button 
                    onClick={isListening ? stopVoiceInput : startVoiceInput}
                    disabled={phase !== 'QUESTION'}
                    className={`w-14 h-14 rounded-2xl flex items-center justify-center transition-all ${
                      isListening 
                        ? 'bg-sky-cyan text-deep-navy shadow-[0_0_20px_rgba(0,255,255,0.3)] scale-105' 
                        : 'bg-slate-blue border border-sky-cyan/30 text-sky-cyan hover:bg-sky-cyan/10'
                    } disabled:opacity-30 disabled:grayscale`}
                  >
                    {isListening ? <MicOff size={24} /> : <Mic size={24} />}
                    {isListening && (
                      <motion.div 
                        className="absolute inset-0 rounded-2xl border-2 border-sky-cyan"
                        animate={{ scale: [1, 1.4], opacity: [0.6, 0] }}
                        transition={{ repeat: Infinity, duration: 1 }}
                      />
                    )}
                  </button>
                  {isListening && <span className="absolute -bottom-6 text-[10px] font-black text-sky-cyan uppercase animate-pulse w-max">{t.quiz_listening}</span>}
                </div>
              )}
            </div>

            <div className="space-y-4">
              <AnimatePresence>
                {error && (
                  <motion.div 
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: 0 }}
                    className="bg-rose-500/10 border border-rose-500/20 p-3 rounded-xl text-xs text-rose-400 flex items-center gap-2 mb-2"
                  >
                    <XCircle size={14} className="shrink-0" />
                    <span>{error}</span>
                  </motion.div>
                )}
              </AnimatePresence>

              <button 
                onClick={() => handleSubmitAnswer(typedAnswer, 'typed')}
                disabled={phase !== 'QUESTION' || typedAnswer.trim() === ''}
                className="w-full py-5 bg-electric-blue text-deep-navy font-bold rounded-2xl flex items-center justify-center gap-2 shadow-lg shadow-electric-blue/20 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-30 disabled:grayscale disabled:scale-100"
              >
                {t.quiz_submit_button}
              </button>
              
              <button 
                onClick={() => handleSubmitAnswer('', 'skipped')}
                disabled={phase !== 'QUESTION'}
                className="w-full text-center text-sm font-medium text-gray-500 hover:text-sky-cyan transition-colors py-2"
              >
                {t.quiz_skip_link}
              </button>
            </div>
         </div>
      </main>

      {/* GRADING OVERLAY */}
      <AnimatePresence>
        {phase === 'GRADING' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-deep-navy/90 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className="bg-slate-blue border border-sky-cyan/30 p-8 rounded-3xl shadow-2xl text-center flex flex-col items-center"
            >
              <div className="relative mb-6">
                 <Loader2 className="text-sky-cyan animate-spin" size={64} />
                 <Sparkles className="absolute -top-1 -right-1 text-electric-blue animate-pulse" size={24} />
              </div>
              <h2 className="text-xl font-bold text-off-white mb-1">Checking your answer</h2>
              <p className="text-gray-400 text-sm italic">AI is verifying pronunciation & spelling...</p>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* FEEDBACK OVERLAY */}
      <AnimatePresence>
        {phase === 'FEEDBACK' && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center p-6 bg-deep-navy/95 backdrop-blur-sm"
          >
            <motion.div 
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              className={`max-w-sm w-full p-10 rounded-3xl border text-center shadow-2xl ${
                lastAnswerCorrect 
                  ? 'bg-emerald-500/10 border-emerald-500/40 shadow-emerald-500/10' 
                  : 'bg-rose-500/10 border-rose-500/40 shadow-rose-500/10'
              }`}
            >
              <div className="mb-6 flex justify-center">
                {lastAnswerCorrect ? (
                  <div className="w-20 h-20 bg-emerald-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(16,185,129,0.4)]">
                    <CheckCircle className="text-deep-navy" size={48} strokeWidth={2.5} />
                  </div>
                ) : (
                  <div className="w-20 h-20 bg-rose-500 rounded-full flex items-center justify-center shadow-[0_0_30px_rgba(255,71,87,0.4)]">
                    <XCircle className="text-deep-navy" size={48} strokeWidth={2.5} />
                  </div>
                )}
              </div>
              
              <h2 className={`text-4xl font-black mb-2 ${lastAnswerCorrect ? 'text-emerald-400' : 'text-rose-400'}`}>
                {lastAnswerCorrect ? t.quiz_correct_message : '✗'}
              </h2>
              
              {!lastAnswerCorrect && (
                <div className="mt-4 p-4 bg-deep-navy/40 rounded-xl space-y-1">
                   <p className="text-xs text-gray-500 uppercase font-black tracking-widest">{t.quiz_wrong_prefix}</p>
                   <p className="text-xl font-bold text-off-white capitalize">{currentWord.word}</p>
                </div>
              )}
              
              <div className="text-xs text-gray-500 italic mt-8">
                {t.quiz_next_label}
                <div className="w-full h-1 bg-white/5 rounded-full mt-2 overflow-hidden">
                   <motion.div 
                     initial={{ width: '100%' }}
                     animate={{ width: '0%' }}
                     transition={{ duration: 1.5, ease: 'linear' }}
                     className={`h-full ${lastAnswerCorrect ? 'bg-emerald-500' : 'bg-rose-500'}`}
                   />
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Sub-component for score counting animation
const ScoreCounter: React.FC<{ end: number, total: number }> = ({ end, total }) => {
  const [count, setCount] = useState(0);
  
  useEffect(() => {
    if (count < end) {
      const timer = setInterval(() => {
        setCount(prev => Math.min(prev + 1, end));
      }, 100);
      return () => clearInterval(timer);
    }
  }, [count, end]);
  
  return <>{count} / {total}</>;
};

export default VocabularyQuizPage;
