import React, { useRef, useEffect } from 'react';
import { type TranscriptMessage, Role } from '../types';
import { User, Bot, Volume2, CheckCircle, Info } from 'lucide-react';
import FillerWordBadge from './FillerWordBadge';

interface TranscriptViewProps {
  transcripts: TranscriptMessage[];
  playPronunciation: (text: string) => void;
}

const TranscriptView: React.FC<TranscriptViewProps> = ({ transcripts, playPronunciation }) => {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [transcripts]);

  return (
    <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-6">
      {transcripts.map((msg) => (
        <div
          key={msg.id}
          className={`flex items-start gap-4 ${msg.role === Role.USER ? 'justify-end' : 'justify-start'}`}
        >
          {msg.role === Role.AI && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-electric-blue flex items-center justify-center shadow-md">
              <Bot className="w-6 h-6 text-deep-navy" />
            </div>
          )}
          <div
            className={`flex flex-col max-w-xl
              ${msg.role === Role.USER
                ? 'items-end'
                : 'items-start'
              }`}
          >
            <div className={`p-4 rounded-2xl shadow-md text-off-white
             ${msg.role === Role.USER
                ? 'bg-user-bubble rounded-br-none'
                : 'bg-ai-bubble rounded-bl-none'
              }`}
            >
              <p className="whitespace-pre-wrap">{msg.text}</p>
            </div>
            {msg.role === Role.USER && <FillerWordBadge transcript={msg.text} />}
            {msg.role === Role.USER && msg.correction && (
              <div className="mt-2 p-3 w-full bg-slate-blue border-l-4 border-sky-cyan rounded-r-lg text-left shadow-md animate-fade-in-up">
                <div className="flex items-center mb-2">
                    <Info className="w-5 h-5 mr-2 text-sky-cyan" />
                    <p className="text-sm text-sky-cyan font-bold">
                    Grammar & Pronunciation Tip
                    </p>
                </div>
                <div className="text-off-white mb-2">
                  <span className="font-semibold text-gray-400">Try saying:</span>
                  <button
                    onClick={() => playPronunciation(msg.correction!.corrected_sentence)}
                    className="ml-2 font-semibold text-aqua-green hover:underline inline-flex items-center text-left"
                    aria-label="Play correct pronunciation"
                  >
                    "{msg.correction!.corrected_sentence}"
                    <Volume2 className="w-4 h-4 ml-1.5 flex-shrink-0" />
                  </button>
                </div>
                <p className="text-sm text-gray-400">
                   {msg.correction!.explanation}
                </p>
              </div>
            )}
            {msg.role === Role.USER && msg.isProcessed && !msg.correction && (
                 <div className="mt-2 p-2 max-w-full bg-aqua-green/10 border border-aqua-green/20 rounded-lg text-left shadow-sm flex items-center animate-fade-in-up">
                    <CheckCircle className="w-5 h-5 mr-2 text-aqua-green" />
                    <p className="text-sm text-aqua-green font-medium">Excellent!</p>
                 </div>
            )}
          </div>
          {msg.role === Role.USER && (
            <div className="flex-shrink-0 w-10 h-10 rounded-full bg-user-bubble flex items-center justify-center shadow-md">
              <User className="w-6 h-6 text-sky-cyan" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
};

export default TranscriptView;