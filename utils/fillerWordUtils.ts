
export interface FillerDetection {
  word: string;
  count: number;
  positions: number[];
}

export interface FillerSummary {
  totalFillers: number;
  mostUsed: string;
  rating: 'excellent' | 'good' | 'needs work';
}

const FILLER_WORDS = [
  "um", "uh", "like", "you know", "basically", "actually", 
  "so", "right", "I mean", "kind of", "sort of"
];

export const detectFillerWords = (transcript: string): FillerDetection[] => {
  const detections: FillerDetection[] = [];
  const normalizedTranscript = transcript.toLowerCase();

  FILLER_WORDS.forEach(filler => {
    // Escape for regex and ensure word boundaries for single words
    // For phrases like "you know", we also want boundaries or specific matches
    const escapedFiller = filler.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`\\b${escapedFiller}\\b`, 'gi');
    
    let match;
    const positions: number[] = [];
    let count = 0;

    while ((match = regex.exec(transcript)) !== null) {
      count++;
      positions.push(match.index);
    }

    if (count > 0) {
      detections.push({ word: filler, count, positions });
    }
  });

  return detections;
};

export const getFillerSummary = (detections: FillerDetection[]): FillerSummary => {
  const totalFillers = detections.reduce((acc, curr) => acc + curr.count, 0);
  
  let mostUsed = "None";
  if (detections.length > 0) {
    mostUsed = detections.reduce((prev, current) => (prev.count > current.count) ? prev : current).word;
  }

  let rating: 'excellent' | 'good' | 'needs work' = 'excellent';
  if (totalFillers >= 6) {
    rating = 'needs work';
  } else if (totalFillers >= 3) {
    rating = 'good';
  }

  return { totalFillers, mostUsed, rating };
};
