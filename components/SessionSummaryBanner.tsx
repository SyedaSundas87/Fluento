import React, { useEffect, useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  BarChart3, 
  MessageSquare, 
  Zap, 
  AlertCircle, 
  Maximize2, 
  Download as DownloadIcon, 
  X,
  Sparkles,
  Lightbulb
} from 'lucide-react';
import { Role, type TranscriptMessage } from '../types';
import { GoogleGenAI, Type } from '@google/genai';

interface SessionSummaryBannerProps {
  transcript: TranscriptMessage[];
  durationSeconds: number;
  onClose: () => void;
  onDownload: () => void;
}

interface AIInsights {
  most_common_error: string;
  next_session_tip: string;
}

const SessionSummaryBanner: React.FC<SessionSummaryBannerProps> = ({ 
  transcript, 
  durationSeconds, 
  onClose, 
  onDownload 
}) => {
  const [insights, setInsights] = useState<AIInsights | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const stats = useMemo(() => {
    const userMessages = transcript.filter(m => m.role === Role.USER);
    const userTurnCount = userMessages.length;
    
    let totalWords = 0;
    let longestCount = 0;
    let corrections = 0;

    userMessages.forEach(m => {
      const words = m.text.trim().split(/\s+/).filter(w => w.length > 0);
      totalWords += words.length;
      if (words.length > longestCount) longestCount = words.length;
      if (m.correction) corrections++;
    });

    const durationMinutes = Math.max(durationSeconds / 60, 0.1); 
    const wpm = Math.round(totalWords / durationMinutes);
    const errorRate = userTurnCount > 0 ? Math.round((corrections / userTurnCount) * 100) : 0;

    return {
      totalWords,
      wpm,
      errorRate,
      longestCount,
      userTurnCount
    };
  }, [transcript, durationSeconds]);

  useEffect(() => {
    const fetchInsights = async (retryCount = 0) => {
      if (transcript.length < 2) return;
      
      setIsLoading(true);
      try {
        const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
        const ai = new GoogleGenAI({ apiKey });
        
        const conversationText = transcript
          .map(m => `${m.role === Role.USER ? 'User' : 'AI'}: ${m.text}${m.correction ? ` (Correction: ${m.correction.corrected_sentence})` : ''}`)
          .join('\n');

        const prompt = `Analyze this language learning conversation and provide insights.
        Focus on the user's grammatical patterns and recurring mistakes mentioned in corrections.
        Provide the response in JSON format.
        
        Transcript:
        ${conversationText}`;

        const response = await ai.models.generateContent({
          model: "gemini-flash-latest",
          contents: prompt,
          config: {
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                most_common_error: { 
                    type: Type.STRING,
                    description: "A short description of the most recurring grammatical or unnatural error (e.g. 'Incorrect use of past tense')"
                },
                next_session_tip: { 
                    type: Type.STRING, 
                    description: "A one-sentence encouragement or specific tip for the next session."
                },
              },
              required: ["most_common_error", "next_session_tip"]
            }
          }
        });

        const insightText = response.text || '';
        if (!insightText || insightText === 'undefined') {
            throw new Error("AI returned empty insights content.");
        }
        let data;
        try {
          data = JSON.parse(insightText.replace(/```(json)?/gi, '').trim());
        } catch (parseError) {
          console.error("Failed to parse API insights:", insightText, parseError);
          throw new Error("AI returned malformed insights data.");
        }
        setInsights(data);
      } catch (error: any) {
        console.error("Error fetching AI insights:", error);
        
        if ((error.message?.includes('429') || error.message?.includes('RESOURCE_EXHAUSTED')) && retryCount < 2) {
          const delay = Math.pow(2, retryCount) * 2000;
          await new Promise(resolve => setTimeout(resolve, delay));
          return fetchInsights(retryCount + 1);
        }
      } finally {
        setIsLoading(false);
      }
    };

    fetchInsights();
  }, [transcript]);

  const handleDownload = () => {
    const content = `FLUENTo - SESSION SUMMARY
Date: ${new Date().toLocaleString()}
Duration: ${Math.floor(durationSeconds / 60)}m ${Math.floor(durationSeconds % 60)}s

STATS:
- Total Words Spoken: ${stats.totalWords}
- Words Per Minute: ${stats.wpm}
- Grammar Error Rate: ${stats.errorRate}%
- Longest Sentence: ${stats.longestCount} words

AI INSIGHTS:
- Most Common Mistake: ${insights?.most_common_error || 'N/A'}
- Focus Next Time: ${insights?.next_session_tip || 'N/A'}

TRANSCRIPT:
${transcript.map(t => {
  let entry = `[${t.role.toUpperCase()}] ${t.text}`;
  if(t.correction) {
    entry += `\n   Correction: "${t.correction.corrected_sentence}"\n   Reason: ${t.correction.explanation}`;
  }
  return entry;
}).join('\n\n')}
`;
    const fileName = `fluento_session_${new Date().toISOString().slice(0, 10)}.txt`;
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); 
    a.href = url; 
    a.download = fileName;
    document.body.appendChild(a); 
    a.click(); 
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    // Call the optional prop if user wants to track events
    if (onDownload) onDownload();
  };

  return (
    <motion.div
      initial={{ y: "100%" }}
      animate={{ y: 0 }}
      exit={{ y: "100%" }}
      transition={{ type: "spring", damping: 25, stiffness: 200 }}
      className="fixed bottom-0 left-0 right-0 z-50 p-4 md:p-6"
    >
      <div className="max-w-6xl mx-auto bg-slate-blue/98 backdrop-blur-2xl border border-sky-cyan/30 rounded-3xl shadow-[0_-20px_60px_rgba(0,0,0,0.6)] overflow-hidden">
        <div className="flex flex-col lg:flex-row">
          {/* Main Info Section */}
          <div className="flex-1 p-6 md:p-8 space-y-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-electric-blue/20 rounded-xl">
                  <BarChart3 className="w-6 h-6 text-electric-blue" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-off-white">Session Dashboard</h2>
                  <p className="text-sm text-gray-400">Analysis of your last {Math.floor(durationSeconds/60)}m conversation.</p>
                </div>
              </div>
              <button 
                onClick={onClose}
                className="p-2 text-gray-400 hover:text-off-white transition-colors bg-white/5 rounded-full"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <StatCard 
                icon={<MessageSquare className="w-5 h-5 text-sky-cyan" />}
                label="Words Spoken"
                value={stats.totalWords}
              />
              <StatCard 
                icon={<Zap className="w-5 h-5 text-yellow-400" />}
                label="WPM"
                value={stats.wpm}
              />
              <StatCard 
                icon={<AlertCircle className="w-5 h-5 text-crimson-red" />}
                label="Error Rate"
                value={`${stats.errorRate}%`}
              />
              <StatCard 
                icon={<Maximize2 className="w-5 h-5 text-aqua-green" />}
                label="Longest Sentence"
                value={stats.longestCount}
              />
            </div>

            <div className="flex flex-wrap gap-4 pt-4 border-t border-sky-cyan/10">
              <button
                onClick={handleDownload}
                className="flex items-center gap-2 px-6 py-3 bg-slate-blue border border-sky-cyan/20 text-off-white font-semibold rounded-xl hover:bg-sky-cyan/10 transition-colors group"
              >
                <DownloadIcon className="w-5 h-5 group-hover:translate-y-0.5 transition-transform" />
                Save Report
              </button>
              <button
                onClick={onClose}
                className="flex items-center gap-2 px-10 py-3 bg-electric-blue text-deep-navy font-extrabold rounded-xl hover:scale-105 active:scale-95 transition-all shadow-lg shadow-electric-blue/20"
              >
                Continue Learning
              </button>
            </div>
          </div>

          {/* AI Side Panel */}
          <div className="w-full lg:w-96 bg-deep-navy/60 border-t lg:border-t-0 lg:border-l border-sky-cyan/10 p-6 md:p-8 flex flex-col justify-center">
            <h3 className="flex items-center gap-2 text-xs font-black text-sky-cyan uppercase tracking-[0.2em] mb-6">
              <Sparkles className="w-4 h-4" />
              AI Feedback
            </h3>
            
            <div className="space-y-6">
              {isLoading ? (
                <div className="space-y-4 animate-pulse">
                  <div className="h-4 bg-slate-blue/50 rounded w-1/2"></div>
                  <div className="h-24 bg-slate-blue/50 rounded"></div>
                  <div className="h-4 bg-slate-blue/50 rounded w-1/2"></div>
                  <div className="h-24 bg-slate-blue/50 rounded"></div>
                </div>
              ) : insights ? (
                <>
                  <InsightCard 
                    icon={<AlertCircle className="w-5 h-5 text-crimson-red" />}
                    title="Most common mistake"
                    text={insights.most_common_error}
                  />
                  <InsightCard 
                    icon={<Lightbulb className="w-5 h-5 text-yellow-400" />}
                    title="Focus next time"
                    text={insights.next_session_tip}
                  />
                </>
              ) : (
                <div className="text-center py-10 opacity-50">
                    <p className="text-sm italic">AI is processing your turn-by-turn data...</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
};

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string | number;
}

const StatCard: React.FC<StatCardProps> = ({ icon, label, value }) => (
  <div className="p-4 bg-deep-navy/40 border border-sky-cyan/5 rounded-2xl flex flex-col items-center sm:items-start text-center sm:text-left hover:border-sky-cyan/20 transition-colors">
    <div className="mb-3 p-2 bg-white/5 rounded-lg">{icon}</div>
    <div className="text-2xl font-black text-off-white mb-1">{value}</div>
    <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">{label}</div>
  </div>
);

interface InsightCardProps {
  icon: React.ReactNode;
  title: string;
  text: string;
}

const InsightCard: React.FC<InsightCardProps> = ({ icon, title, text }) => (
  <div className="group space-y-2">
    <div className="flex items-center gap-2 text-xs font-bold text-gray-300 uppercase tracking-wide group-hover:text-off-white transition-colors">
      {icon}
      {title}
    </div>
    <div className="p-4 bg-slate-blue/40 border border-sky-cyan/10 rounded-2xl text-sm text-gray-400 leading-relaxed group-hover:border-sky-cyan/30 group-hover:text-gray-200 transition-all">
      {text}
    </div>
  </div>
);

export default SessionSummaryBanner;
