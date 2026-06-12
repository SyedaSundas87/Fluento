
import React, { useState, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { AlertCircle, ChevronDown, ChevronUp, Info } from 'lucide-react';
import { detectFillerWords, getFillerSummary } from '../utils/fillerWordUtils';

interface FillerWordBadgeProps {
  transcript: string;
}

const FillerWordBadge: React.FC<FillerWordBadgeProps> = ({ transcript }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const detections = useMemo(() => detectFillerWords(transcript), [transcript]);
  const summary = useMemo(() => getFillerSummary(detections), [detections]);

  if (summary.totalFillers === 0) return null;

  const getRatingColors = (rating: string) => {
    switch (rating) {
      case 'excellent': return 'bg-aqua-green/10 text-aqua-green border-aqua-green/20';
      case 'good': return 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20';
      default: return 'bg-crimson-red/10 text-crimson-red border-crimson-red/20';
    }
  };

  return (
    <div className="mt-2 inline-block">
      <div 
        onClick={() => setIsExpanded(!isExpanded)}
        className={`flex items-center gap-2 px-3 py-1 rounded-full border text-xs font-medium cursor-pointer transition-all hover:brightness-110 ${getRatingColors(summary.rating)}`}
      >
        <AlertCircle size={12} />
        <span>{summary.totalFillers} Filler {summary.totalFillers === 1 ? 'Word' : 'Words'}</span>
        {isExpanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        
        {/* Simple Tooltip on the Info Icon */}
        <div className="ml-1 group relative flex items-center">
          <Info size={12} className="opacity-60" />
          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block w-48 p-2 bg-deep-navy border border-sky-cyan/20 rounded-lg text-[10px] text-off-white shadow-xl pointer-events-none z-10">
            Tip: Try pausing silently instead of saying "um".
            <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-1 border-4 border-transparent border-t-deep-navy"></div>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-2 p-3 bg-slate-blue/50 rounded-xl border border-sky-cyan/10 grid grid-cols-2 gap-2">
              {detections.map((d, index) => (
                <div key={index} className="flex justify-between items-center text-[10px] text-gray-400">
                  <span className="capitalize font-medium text-off-white">{d.word}</span>
                  <span className="bg-sky-cyan/10 px-1.5 py-0.5 rounded text-sky-cyan">x{d.count}</span>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default FillerWordBadge;
