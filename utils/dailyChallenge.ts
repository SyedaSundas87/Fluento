
export interface Challenge {
  id: number;
  topic: string;
  prompt: string;
  duration: number; // in seconds
  date: string;
}

export interface StreakData {
  currentStreak: number;
  longestStreak: number;
  lastCompleted: string | null;
  history: string[]; // dates completed: YYYY-MM-DD
}

const CHALLENGE_TOPICS = [
  { topic: "Job Interview", prompt: "Explain your greatest professional achievement and why it matters." },
  { topic: "Travel Scenario", prompt: "You are at a hotel in Paris and there is no record of your reservation. Resolve the situation." },
  { topic: "My City", prompt: "Describe your favorite spot in your city and what makes it special to you." },
  { topic: "Pakistani Food", prompt: "Explain the process of making Biryani to someone who has never heard of it." },
  { topic: "Hobbies", prompt: "Talk about a hobby you've had for a long time and how it has changed your life." },
  { topic: "Technology", prompt: "What do you think is the most impactful invention of the last decade?" },
  { topic: "Future Plans", prompt: "Where do you see yourself in five years, both personally and professionally?" },
  { topic: "Environment", prompt: "Describe one small change people can make in their daily lives to help the planet." },
  { topic: "Music", prompt: "Talk about a song or artist that resonates with you deeply and why." },
  { topic: "Health", prompt: "Describe your personal philosophy on maintaining a healthy lifestyle." },
  { topic: "Education", prompt: "If you could learn any new skill instantly, what would it be and why?" },
  { topic: "Social Media", prompt: "Discuss the impact of social media on modern social interactions." },
  { topic: "Books", prompt: "Describe the last book you read and why you would (or wouldn't) recommend it." },
  { topic: "Family", prompt: "Talk about a family tradition that means a lot to you." },
  { topic: "Movies", prompt: "Describe a movie that changed your perspective on a certain topic." },
  { topic: "Work-Life Balance", prompt: "How do you manage stress and maintain a healthy balance between work and rest?" },
  { topic: "Local Market", prompt: "Describe the sights, sounds, and smells of a busy Sunday market." },
  { topic: "Art", prompt: "What does 'art' mean to you? Is it something you incorporate into your life?" },
  { topic: "Dreams", prompt: "Talk about a recurring dream you have or a dream you remember vividly." },
  { topic: "Motivation", prompt: "What keeps you going when things get difficult?" },
  { topic: "Friendship", prompt: "Describe the qualities you value most in a close friend." },
  { topic: "Pets", prompt: "Talk about a pet you have or one you'd like to have." },
  { topic: "Languages", prompt: "Besides English, what other language would you like to master and why?" },
  { topic: "Cooking", prompt: "Describe a time a recipe went completely wrong for you." },
  { topic: "Success", prompt: "Define what 'success' looks like to you personally." },
  { topic: "Childhood", prompt: "Describe your favorite childhood memory involving the outdoors." },
  { topic: "Sports", prompt: "Talk about a sport you enjoy playing or watching and the emotions it brings out." },
  { topic: "Seasons", prompt: "Describe your favorite season of the year and why you prefer it." },
  { topic: "Daily Routine", prompt: "Walk me through your morning routine from the moment you wake up." },
  { topic: "The Future", prompt: "What is one thing you hope will be different about the world in 50 years?" },
];

export const getDailyChallenge = (): Challenge => {
  const today = new Date();
  const dateString = today.toISOString().split('T')[0];
  
  // Use date as a seed for deterministic selection
  const dayOfYear = Math.floor((today.getTime() - new Date(today.getFullYear(), 0, 0).getTime()) / (1000 * 60 * 60 * 24));
  const index = dayOfYear % CHALLENGE_TOPICS.length;
  
  return {
    id: index,
    ...CHALLENGE_TOPICS[index],
    duration: 120, // 2 minutes
    date: dateString,
  };
};

const getStorageKey = (email: string) => `fluento_streak_${email}`;

export const getStreak = (userEmail: string): StreakData => {
  const stored = localStorage.getItem(getStorageKey(userEmail));
  if (!stored) {
    return { currentStreak: 0, longestStreak: 0, lastCompleted: null, history: [] };
  }
  try {
    return JSON.parse(stored);
  } catch (e) {
    console.error("Error parsing streak data:", e);
    // Recover from corrputed streak data
    return { currentStreak: 0, longestStreak: 0, lastCompleted: null, history: [] };
  }
};

export const updateStreak = (userEmail: string): StreakData => {
  const data = getStreak(userEmail);
  const today = new Date().toISOString().split('T')[0];
  
  if (data.lastCompleted === today) return data; // Already completed today
  
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayString = yesterday.toISOString().split('T')[0];
  
  const newHistory = [...data.history, today];
  let newCurrentStreak = 1;
  
  if (data.lastCompleted === yesterdayString) {
    newCurrentStreak = data.currentStreak + 1;
  }
  
  const newLongestStreak = Math.max(data.longestStreak, newCurrentStreak);
  
  const newData: StreakData = {
    currentStreak: newCurrentStreak,
    longestStreak: newLongestStreak,
    lastCompleted: today,
    history: newHistory,
  };
  
  localStorage.setItem(getStorageKey(userEmail), JSON.stringify(newData));
  return newData;
};

export const isChallengeCompletedToday = (userEmail: string): boolean => {
  const data = getStreak(userEmail);
  const today = new Date().toISOString().split('T')[0];
  return data.lastCompleted === today;
};
