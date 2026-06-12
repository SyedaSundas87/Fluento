
export interface AssessmentSentence {
  id: string;
  text: string;
  difficulty: 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2';
}

export const READ_ALOUD_BANK: AssessmentSentence[] = [
  { id: 'ra1', text: "The quick brown fox jumps over the lazy dog.", difficulty: 'A1' },
  { id: 'ra2', text: "Success is not final, failure is not fatal: it is the courage to continue that counts.", difficulty: 'B1' },
  { id: 'ra3', text: "Patience and perseverance have a magical effect before which difficulties disappear and obstacles vanish.", difficulty: 'B2' },
  { id: 'ra4', text: "To be, or not to be, that is the question: whether 'tis nobler in the mind to suffer the slings and arrows of outrageous fortune.", difficulty: 'C1' },
  { id: 'ra5', text: "Climate change is a significant global challenge that requires immediate and sustained international cooperation.", difficulty: 'B2' },
  { id: 'ra6', text: "The aroma of freshly brewed coffee filled the small, cozy kitchen in the early morning.", difficulty: 'A2' },
  { id: 'ra7', text: "In conclusion, the results of the study indicate a strong correlation between sleep quality and academic performance.", difficulty: 'B2' },
  { id: 'ra8', text: "She sells seashells by the seashore, and the shells she sells are surely seashells.", difficulty: 'B1' },
  { id: 'ra9', text: "Technology has revolutionized the way we communicate, work, and perceive the world around us.", difficulty: 'B1' },
  { id: 'ra10', text: "The subtle nuances of literary language can be quite challenging for non-native speakers to master.", difficulty: 'C1' },
];

export const REPEAT_PHRASES_BANK: string[] = [
  "A piece of cake.",
  "Better late than never.",
  "The best of both worlds.",
  "Break a leg!",
  "Call it a day.",
  "Once in a blue moon.",
  "Under the weather.",
  "Speak of the devil.",
  "See eye to eye.",
  "Kill two birds with one stone.",
];

export const DESCRIPTION_TOPICS: string[] = [
  "Describe your morning routine from waking up to starting your work or studies.",
  "Talk about your favorite traditional Pakistani dish and why you like it.",
  "Describe a visit to a local market in your city — what sights, sounds, and smells do you remember?",
  "Tell me about your family background and a specific tradition you celebrate together.",
  "Describe your favorite spot in nature, like a park, mountains, or a beach.",
  "Talk about a significant festival in Pakistan, such as Eid-ul-Fitr or Independence Day.",
  "Describe a typical day at your office or university.",
  "Talk about a person in your life who has influenced you greatly.",
  "Describe an interesting historical site you have visited in Pakistan.",
  "Tell me about a hobby or activity you enjoy doing in your free time.",
];

export const OPINION_QUESTIONS: string[] = [
  "What do you think are the pros and cons of online education compared to traditional classrooms?",
  "How has technology changed the way families spend time together in your opinion?",
  "Do you think it is important for young people to stay in their hometowns, or should they move to big cities for work?",
  "What is your opinion on the impact of social media on mental health and social relationships?",
  "In your view, what can individuals do to help reduce pollution in large cities?",
  "How do you feel about the balance between work and personal life in modern society?",
  "What are your thoughts on the importance of learning multiple languages in today's globalized world?",
  "In your opinion, what makes a city a great place to live in?",
  "Do you think public transportation should be free for all citizens? Why or why not?",
  "What do you think is the most important quality a good leader should have?",
];
