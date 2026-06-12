import React, { useState, useEffect, useCallback, useRef } from 'react';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { type VocabularyWord, type Language, type User } from '../types';
import { Volume2, AlertTriangle, TrendingUp } from 'lucide-react';
import { decodeAudioData, decode, playWebSpeechFallback } from '../utils/audioUtils';
import { trackVocabularySession } from '../utils/progress';
import { isRateLimitError, wait } from '../utils/errorUtils';

interface VocabularyPageProps {
  user: User;
  selectedLanguage: Language;
  setQuizWords: (words: VocabularyWord[]) => void;
  setActivePage: (page: any) => void;
}

const VocabularyPage: React.FC<VocabularyPageProps> = ({ user, selectedLanguage, setQuizWords, setActivePage }) => {
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);

  const fetchWords = useCallback(async (forceRefresh = false, retryCount = 0) => {
    setIsLoading(true);
    setError(null);

    // Check Cache first
    const today = new Date().toISOString().split('T')[0];
    // Added v2 suffix to force refresh with the new English definition requirement
    const cacheKey = `vocabulary_${selectedLanguage.code}_${today}_v2`;
    
    if (!forceRefresh) {
      const cached = localStorage.getItem(cacheKey);
      if (cached) {
        try {
          const parsed = JSON.parse(cached);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setWords(parsed);
            setIsLoading(false);
            return;
          }
        } catch (e) {
          console.error("Cache error:", e);
        }
      }
    }

    if (retryCount === 0) setWords([]);
    
    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      const ai = new GoogleGenAI({ apiKey });
      
      // LAYER 1: Generate in English first
      const englishPrompt = `You are a language learning expert.
      Generate 10 interesting vocabulary words for a student.
      The words should be useful for daily conversation.
      
      Return a valid JSON array of objects:
      [
        { "word_en": "example", "definition": "a representative form or pattern", "example_en": "This is a perfect example of modern art." }
      ]`;

      const englishResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: englishPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word_en: { type: Type.STRING },
                definition: { type: Type.STRING },
                example_en: { type: Type.STRING },
              },
              required: ["word_en", "definition", "example_en"]
            }
          },
        },
      });

      const englishText = englishResponse.text || '';
      if (!englishText || englishText === 'undefined') {
          throw new Error("AI returned empty or undefined content for English generation.");
      }
      let englishData;
      try {
        englishData = JSON.parse(englishText.replace(/```(json)?/gi, '').trim());
      } catch (parseError) {
        console.error("Failed to parse English vocabulary JSON:", englishText, parseError);
        throw new Error("AI returned malformed vocabulary data.");
      }

      // LAYER 2: Translate to target language
      const translationPrompt = `Translate the following vocabulary list from English to ${selectedLanguage.name}.
      
      IMPORTANT:
      1. Keep "definition" in ENGLISH.
      2. Translate "word_en" to "word" (in ${selectedLanguage.name}).
      3. Translate "example_en" to "example" (in ${selectedLanguage.name}).
      
      JSON to translate:
      ${JSON.stringify(englishData)}
      
      Respond only with the translated JSON array.`;

      const translatedResponse = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: translationPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                word: { type: Type.STRING },
                definition: { type: Type.STRING },
                example: { type: Type.STRING },
              },
              required: ["word", "definition", "example"]
            }
          },
        },
      });

      try {
        const translatedText = translatedResponse.text || '';
        if (!translatedText || translatedText === 'undefined') {
            throw new Error("AI returned empty or undefined content for translated generation.");
        }
        const result = JSON.parse(translatedText.replace(/```(json)?/gi, '').trim());
        if (Array.isArray(result)) {
            setWords(result);
            localStorage.setItem(cacheKey, JSON.stringify(result));
            trackVocabularySession(user.email); // Track progress
        } else {
            throw new Error("Parsed data is not an array.");
        }
      } catch (e) {
          console.error("Error parsing vocabulary words:", e);
          setError(`The AI returned an unexpected format. Please try again.`);
      }
    } catch (e: any) {
      console.error("Error fetching words:", e);
      
      if (isRateLimitError(e) && retryCount < 4) {
        await wait(Math.pow(2, retryCount) * 3000);
        return fetchWords(forceRefresh, retryCount + 1);
      }

      setError(`Could not fetch vocabulary for ${selectedLanguage.name}. Rate limit may have been reached.`);
    } finally {
      setIsLoading(false);
    }
  }, [selectedLanguage.name, selectedLanguage.code, user.email]);

  useEffect(() => {
    fetchWords();
  }, [fetchWords]);

  const playPronunciation = async (text: string, retryCount = 0) => {
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
         let audioCtx = outputAudioContextRef.current;
         if (!audioCtx || audioCtx.state === 'closed') {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)({ sampleRate: 24000 });
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
        console.error("Error playing pronunciation:", e);
      }
      
      // Fallback to browser TTS on any error (like quota exceeded)
      try {
        await playWebSpeechFallback(text, selectedLanguage.code);
        setError(null); // Clear error since fallback succeeded
        return;
      } catch (fallbackError) {
        console.error("Fallback TTS also failed:", fallbackError);
      }

      if (isRateLimitError(e) && retryCount < 4) {
        const delay = Math.pow(2, retryCount) * 3000;
        await wait(delay);
        return playPronunciation(text, retryCount + 1);
      }

      setError("Could not play pronunciation audio. Rate limit may have been reached.");
    }
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
          <div className="w-12 h-12 border-4 border-t-transparent border-electric-blue rounded-full animate-spin"></div>
          <p className="mt-4 text-lg">Fetching today's vocabulary...</p>
        </div>
      );
    }
  
    if (error) {
      return (
        <div className="flex-1 flex flex-col items-center justify-center text-center text-crimson-red p-6">
          <AlertTriangle size={48} className="mb-4" />
          <h2 className="text-xl font-semibold">Oops! Something went wrong.</h2>
          <p className="max-w-md mt-2 mb-6">{error}</p>
          <button 
            onClick={() => fetchWords(true)}
            className="px-6 py-2 bg-electric-blue text-deep-navy font-bold rounded-lg hover:scale-105 transition-transform"
          >
            Try Again
          </button>
        </div>
      );
    }

    return (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
            {words.map((wordData, index) => (
                <div 
                    key={index}
                    className="bg-slate-blue border border-sky-cyan/20 rounded-xl p-4 shadow-lg hover:shadow-sky-cyan/10 hover:-translate-y-1 transition-all duration-300 animate-fade-in-up"
                    style={{ animationDelay: `${index * 50}ms` }}
                >
                    <div className="flex items-center justify-between mb-2">
                        <h3 className="text-lg font-bold text-electric-blue">{wordData.word}</h3>
                        <button 
                            onClick={() => playPronunciation(wordData.word)}
                            className="p-2 rounded-full text-gray-400 hover:bg-user-bubble transition-colors"
                            aria-label={`Listen to ${wordData.word}`}
                        >
                            <Volume2 size={20} />
                        </button>
                    </div>
                    <p className="text-sm text-gray-300 mb-3">{wordData.definition}</p>
                    <p className="text-xs text-gray-400 italic border-l-2 border-sky-cyan/30 pl-2">
                        "{wordData.example}"
                    </p>
                </div>
            ))}
        </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-deep-navy">
        <header className="p-4 border-b border-sky-cyan/20 sticky top-0 bg-slate-blue/80 backdrop-blur-sm z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <h1 className="text-xl font-bold text-electric-blue">Daily Vocabulary</h1>
              <p className="text-sm text-gray-400">Boost your {selectedLanguage.name} vocabulary with 10 new words a day.</p>
            </div>
            <button 
              onClick={() => {
                setQuizWords(words);
                setActivePage('vocabulary-quiz');
              }}
              disabled={words.length === 0}
              className="w-full sm:w-auto px-6 py-2 bg-electric-blue text-deep-navy font-bold rounded-lg hover:scale-105 transition-transform disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              <span>🎯 Quiz Mode</span>
            </button>
        </header>
        <main className="flex-1 p-4">
            {renderContent()}
        </main>
    </div>
  );
};

export default VocabularyPage;