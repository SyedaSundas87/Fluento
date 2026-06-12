export enum Role {
  USER = 'user',
  AI = 'ai',
}

export interface Blob {
  data: string;
  mimeType: string;
}

export interface Correction {
  corrected_sentence: string;
  explanation: string;
}

export interface TranscriptMessage {
  id: string;
  role: Role;
  text: string;
  correction?: Correction;
  isProcessed?: boolean;
}

export enum Status {
  IDLE = 'idle',
  CONNECTING = 'connecting',
  LISTENING = 'listening',
  SPEAKING = 'speaking',
  STOPPING = 'stopping',
}

export interface Language {
  name: string;
  code: string;
  flag: string;
  voice: string;
}

export interface Mode {
  id: string;
  name: string;
}

export interface VocabularyWord {
  word: string;
  definition: string;
  example: string;
}

// For Authentication
export interface User {
  fullName: string;
  email: string;
}

// For Progress Tracking
export interface ProgressData {
  conversation: {
    sessions: number;
    totalCorrections: number;
  };
  vocabulary: {
    sessions: number;
  };
  accentCoach: {
    sentencesPracticed: number;
    scores: number[];
    averageScore: number;
  };
}