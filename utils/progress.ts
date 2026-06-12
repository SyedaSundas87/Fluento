import { ProgressData } from '../types';

const PROGRESS_KEY_PREFIX = 'ai_tutor_progress_';

const getDefaultProgress = (): ProgressData => ({
  conversation: {
    sessions: 0,
    totalCorrections: 0,
  },
  vocabulary: {
    sessions: 0,
  },
  accentCoach: {
    sentencesPracticed: 0,
    scores: [],
    averageScore: 0,
  },
});

/**
 * Retrieves progress data for a given user.
 * @param email - The user's email.
 * @returns The user's progress data.
 */
export const getProgress = (email: string): ProgressData => {
  const data = localStorage.getItem(`${PROGRESS_KEY_PREFIX}${email}`);
  if (data) {
    try {
      const storedData = JSON.parse(data);
      return { ...getDefaultProgress(), ...storedData };
    } catch (e) {
      console.error("Error parsing progress data:", e);
      localStorage.removeItem(`${PROGRESS_KEY_PREFIX}${email}`);
    }
  }
  return getDefaultProgress();
};

/**
 * Saves progress data for a given user.
 * @param email - The user's email.
 * @param data - The progress data to save.
 */
const saveProgress = (email: string, data: ProgressData): void => {
  localStorage.setItem(`${PROGRESS_KEY_PREFIX}${email}`, JSON.stringify(data));
};

/**
 * Tracks a completed conversation session.
 * @param email - The user's email.
 * @param correctionCount - The number of corrections in the session.
 */
export const trackConversationSession = (email: string, correctionCount: number): void => {
  const progress = getProgress(email);
  progress.conversation.sessions += 1;
  progress.conversation.totalCorrections += correctionCount;
  saveProgress(email, progress);
};

/**
 * Tracks a completed vocabulary session.
 * @param email - The user's email.
 */
export const trackVocabularySession = (email: string): void => {
  const progress = getProgress(email);
  progress.vocabulary.sessions += 1;
  saveProgress(email, progress);
};

/**
 * Tracks a completed accent practice.
 * @param email - The user's email.
 * @param score - The score received for the practice.
 */
export const trackAccentPractice = (email: string, score: number): void => {
  const progress = getProgress(email);
  progress.accentCoach.sentencesPracticed += 1;
  progress.accentCoach.scores.push(score);
  
  const totalScore = progress.accentCoach.scores.reduce((sum, s) => sum + s, 0);
  progress.accentCoach.averageScore = Math.round(totalScore / progress.accentCoach.scores.length);
  
  saveProgress(email, progress);
};
