import React, { useState, useRef, useEffect } from 'react';
import { 
  Users, 
  MapPin, 
  Sparkles, 
  Download, 
  RotateCcw,
  ChevronDown, 
  Copy, 
  BookOpen, 
  Volume2, 
  X,
  Search,
  Check,
  ChevronRight,
  ArrowLeft,
  ArrowRight,
  Info,
  MessageSquare,
  Globe,
  Settings
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { GoogleGenAI, Type } from "@google/genai";
import { useLanguage, useTranslations } from '../hooks/useLanguage';
import { LANGUAGE_CONFIG } from '../utils/languageConfig';
import { isRateLimitError, wait } from '../utils/errorUtils';

interface Character {
  id: string;
  name: string;
  role: string;
  emoji: string;
  description: string;
}

interface Scenario {
  id: string;
  title: string;
  emoji: string;
  environment: string;
  description: string;
  tone: 'formal' | 'semi-formal' | 'casual';
  category: string;
}

interface ScriptLine {
  character: string;
  characterEmoji: string;
  dialogue: string;
  note?: string;   // optional grammar/vocabulary tip for this line
}

interface GeneratedScript {
  title: string;
  scenario: string;
  characters: string[];
  tone: string;
  lines: ScriptLine[];
  vocabularyHighlights: { word: string; meaning: string }[];
  usefulPhrases: string[];
  culturalNote?: string;
}

type PagePhase = 
  'SETUP'        // user choosing characters and scenario
  | 'GENERATING' // AI is generating the script
  | 'READING';    // script is displayed

const PRESET_CHARACTERS: Character[] = [
  // Professional roles
  { id: 'employee', name: 'Employee', role: 'Office Worker', emoji: '👨‍💼', description: 'A professional working in an office' },
  { id: 'boss', name: 'Manager', role: 'Team Manager', emoji: '👩‍💼', description: 'A senior manager or team lead' },
  { id: 'doctor', name: 'Doctor', role: 'Medical Doctor', emoji: '👨‍⚕️', description: 'A qualified medical doctor' },
  { id: 'patient', name: 'Patient', role: 'Hospital Patient', emoji: '🤒', description: 'A patient visiting a clinic or hospital' },
  { id: 'teacher', name: 'Teacher', role: 'School Teacher', emoji: '👩‍🏫', description: 'A school or university teacher' },
  { id: 'student', name: 'Student', role: 'University Student', emoji: '👨‍🎓', description: 'A student in school or university' },
  { id: 'shopkeeper', name: 'Shopkeeper', role: 'Shop Owner', emoji: '🛒', description: 'A person running a shop or store' },
  { id: 'customer', name: 'Customer', role: 'Shopper', emoji: '🙋', description: 'A customer buying something' },
  { id: 'interviewer', name: 'Interviewer', role: 'HR Manager', emoji: '📋', description: 'A person conducting a job interview' },
  { id: 'candidate', name: 'Candidate', role: 'Job Applicant', emoji: '🧑‍💻', description: 'A person attending a job interview' },
  { id: 'waiter', name: 'Waiter', role: 'Restaurant Staff', emoji: '🍽️', description: 'A server at a restaurant or cafe' },
  { id: 'guest', name: 'Guest', role: 'Restaurant Customer', emoji: '🍴', description: 'A person dining at a restaurant' },
  { id: 'receptionist', name: 'Receptionist', role: 'Front Desk', emoji: '📞', description: 'A receptionist at a hotel or office' },
  { id: 'traveler', name: 'Traveler', role: 'Tourist', emoji: '✈️', description: 'A person travelling or exploring' },
  { id: 'neighbor', name: 'Neighbor', role: 'Neighbour', emoji: '🏠', description: 'Someone living nearby' },
  { id: 'friend', name: 'Friend', role: 'Close Friend', emoji: '🤝', description: 'A close personal friend' },
  { id: 'parent', name: 'Parent', role: 'Mother or Father', emoji: '👨‍👩‍👦', description: 'A parent speaking to their child' },
  { id: 'child', name: 'Child / Student', role: 'Young Person', emoji: '🧒', description: 'A young student or child' },
  { id: 'police', name: 'Police Officer', role: 'Law Enforcement', emoji: '👮', description: 'A police officer on duty' },
  { id: 'banker', name: 'Bank Officer', role: 'Bank Staff', emoji: '🏦', description: 'A bank employee helping a client' },
  { id: 'custom', name: 'Custom Character', role: 'User Defined', emoji: '✏️', description: 'Define your own character' },
];

const PRESET_SCENARIOS: Scenario[] = [
  // WORKPLACE
  { id: 'job_interview', title: 'Job Interview', emoji: '💼', environment: 'A corporate office meeting room', description: 'A formal job interview for a software position', tone: 'formal', category: 'Workplace' },
  { id: 'performance_review', title: 'Performance Review', emoji: '📊', environment: 'Manager\'s office', description: 'Annual performance review between manager and employee', tone: 'semi-formal', category: 'Workplace' },
  { id: 'team_meeting', title: 'Team Meeting', emoji: '🤝', environment: 'Office conference room', description: 'A team meeting to discuss a project update', tone: 'semi-formal', category: 'Workplace' },
  { id: 'asking_leave', title: 'Requesting Leave', emoji: '📅', environment: 'Manager\'s office', description: 'Employee asking manager for time off work', tone: 'semi-formal', category: 'Workplace' },
  { id: 'complain_workplace', title: 'Raising a Concern', emoji: '🗣️', environment: 'HR office', description: 'Employee raising a workplace concern with HR', tone: 'formal', category: 'Workplace' },
  // EDUCATION
  { id: 'classroom', title: 'Classroom Discussion', emoji: '📚', environment: 'University classroom', description: 'Student asking teacher about a difficult topic', tone: 'semi-formal', category: 'Education' },
  { id: 'university_admission', title: 'University Admission', emoji: '🎓', environment: 'University admissions office', description: 'Student inquiring about admission requirements', tone: 'formal', category: 'Education' },
  { id: 'exam_results', title: 'Discussing Exam Results', emoji: '📝', environment: 'Teacher\'s office', description: 'Student discussing poor exam results with teacher', tone: 'semi-formal', category: 'Education' },
  { id: 'group_project', title: 'Group Project Discussion', emoji: '👥', environment: 'University library', description: 'Two students planning a group assignment together', tone: 'casual', category: 'Education' },
  // MEDICAL
  { id: 'doctor_visit', title: 'Doctor Consultation', emoji: '🏥', environment: 'Doctor\'s clinic', description: 'Patient describing symptoms to a doctor', tone: 'semi-formal', category: 'Medical' },
  { id: 'pharmacy', title: 'At the Pharmacy', emoji: '💊', environment: 'A pharmacy counter', description: 'Customer asking about medicine at a pharmacy', tone: 'semi-formal', category: 'Medical' },
  { id: 'emergency', title: 'Emergency Room Visit', emoji: '🚨', environment: 'Hospital emergency room', description: 'Patient arriving at emergency with urgent symptoms', tone: 'semi-formal', category: 'Medical' },
  // SHOPPING & SERVICES
  { id: 'shopping_mall', title: 'Shopping at a Mall', emoji: '🛍️', environment: 'A clothing store in a mall', description: 'Customer shopping for clothes and asking for help', tone: 'casual', category: 'Shopping' },
  { id: 'bargaining', title: 'Bargaining at Market', emoji: '🛒', environment: 'A local bazaar or market', description: 'Customer negotiating price with shopkeeper', tone: 'casual', category: 'Shopping' },
  { id: 'complaint_shop', title: 'Product Complaint', emoji: '↩️', environment: 'Customer service desk', description: 'Customer returning a faulty product', tone: 'semi-formal', category: 'Shopping' },
  { id: 'bank_visit', title: 'At the Bank', emoji: '🏦', environment: 'A bank branch', description: 'Customer opening an account or asking about services', tone: 'formal', category: 'Shopping' },
  // TRAVEL
  { id: 'airport', title: 'At the Airport', emoji: '✈️', environment: 'International airport check-in', description: 'Traveler checking in and asking about the flight', tone: 'semi-formal', category: 'Travel' },
  { id: 'hotel_checkin', title: 'Hotel Check-In', emoji: '🏨', environment: 'Hotel reception desk', description: 'Guest checking into a hotel and asking about amenities', tone: 'semi-formal', category: 'Travel' },
  { id: 'asking_directions', title: 'Asking for Directions', emoji: '🗺️', environment: 'On a city street', description: 'Tourist asking a local for directions', tone: 'casual', category: 'Travel' },
  { id: 'taxi_ride', title: 'Booking a Taxi / Ride', emoji: '🚕', environment: 'Street or ride-hailing app pickup', description: 'Passenger communicating with a driver', tone: 'casual', category: 'Travel' },
  // SOCIAL & DAILY LIFE
  { id: 'restaurant_order', title: 'Ordering at Restaurant', emoji: '🍽️', environment: 'A restaurant or cafe', description: 'Guest ordering food and asking about the menu', tone: 'casual', category: 'Daily Life' },
  { id: 'neighbor_chat', title: 'Chatting with Neighbor', emoji: '🏠', environment: 'Apartment building hallway', description: 'Two neighbors having a friendly conversation', tone: 'casual', category: 'Daily Life' },
  { id: 'phone_call', title: 'Formal Phone Call', emoji: '📱', environment: 'Telephone conversation', description: 'Making a formal call to schedule an appointment', tone: 'formal', category: 'Daily Life' },
  { id: 'apology', title: 'Making an Apology', emoji: '🙏', environment: 'Office or social setting', description: 'One person apologizing sincerely to another', tone: 'semi-formal', category: 'Daily Life' },
  { id: 'catching_up', title: 'Catching Up with a Friend', emoji: '☕', environment: 'A coffee shop', description: 'Two friends meeting after a long time apart', tone: 'casual', category: 'Daily Life' },
  // PAKISTAN-SPECIFIC
  { id: 'rishta', title: 'Formal Family Introduction', emoji: '👨‍👩‍👧', environment: 'Family home living room', description: 'A formal family introduction meeting in English', tone: 'formal', category: 'Pakistan Specific' },
  { id: 'visa_interview', title: 'Visa Interview', emoji: '🛂', environment: 'Embassy or consulate office', description: 'Applicant attending a visa interview', tone: 'formal', category: 'Pakistan Specific' },
  { id: 'ielts_speaking', title: 'IELTS Speaking Practice', emoji: '🎓', environment: 'IELTS exam room', description: 'Examiner and student in an IELTS speaking test', tone: 'formal', category: 'Pakistan Specific' },
  { id: 'ngo_interview', title: 'NGO / Volunteer Interview', emoji: '🌍', environment: 'NGO office', description: 'Candidate being interviewed for a volunteer position', tone: 'semi-formal', category: 'Pakistan Specific' },
  // CUSTOM
  { id: 'custom', title: 'Custom Scenario', emoji: '✏️', environment: 'User defined', description: 'Describe your own scenario and environment', tone: 'semi-formal', category: 'Custom' },
];

interface ConversationScriptPageProps {
  onPractice?: (script: { title: string; scenario: string; lines: { character: string; dialogue: string }[] }) => void;
}

const ConversationScriptPage: React.FC<ConversationScriptPageProps> = ({ onPractice }) => {
  const t = useTranslations();
  const currentLanguage = useLanguage();
  const langConfig = LANGUAGE_CONFIG[currentLanguage] || LANGUAGE_CONFIG['English'];

  const [phase, setPhase] = useState<PagePhase>('SETUP');
  const [character1, setCharacter1] = useState<Character | null>(null);
  const [character2, setCharacter2] = useState<Character | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<Scenario | null>(null);
  const [customChar1Name, setCustomChar1Name] = useState('');
  const [customChar2Name, setCustomChar2Name] = useState('');
  const [customChar1Role, setCustomChar1Role] = useState('');
  const [customChar2Role, setCustomChar2Role] = useState('');
  const [customScenarioText, setCustomScenarioText] = useState('');
  const [customEnvironment, setCustomEnvironment] = useState('');
  const [scriptLength, setScriptLength] = useState<'short' | 'medium' | 'long'>('medium');
  const [generatedScript, setGeneratedScript] = useState<GeneratedScript | null>(null);
  
  // Translation state
  const [showTranslations, setShowTranslations] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [translatedContent, setTranslatedContent] = useState<{
    lines: string[];
    vocabulary: string[];
  } | null>(null);

  const [error, setError] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedLine, setCopiedLine] = useState<number | null>(null);
  const [showPicker1, setShowPicker1] = useState(false);
  const [showPicker2, setShowPicker2] = useState(false);
  const [charSearch1, setCharSearch1] = useState('');
  const [charSearch2, setCharSearch2] = useState('');
  const [generatingMessage, setGeneratingMessage] = useState('Writing natural dialogue...');

  // Cycle generating messages
  useEffect(() => {
    if (phase === 'GENERATING') {
      const messages = [
        "Writing natural dialogue...",
        "Adding vocabulary highlights...",
        "Making it relevant for you...",
        "Almost ready..."
      ];
      let i = 0;
      const interval = setInterval(() => {
        i = (i + 1) % messages.length;
        setGeneratingMessage(messages[i]);
      }, 2000);
      return () => clearInterval(interval);
    }
  }, [phase]);

  const generateScript = async (retryCount = 0) => {
    if (!character1 || !character2 || !selectedScenario) return;

    if (retryCount === 0) {
      setPhase('GENERATING');
      setError('');
    }

    // Resolve character names
    const char1Name = character1.id === 'custom' ? (customChar1Name || 'Person A') : character1.name;
    const char2Name = character2.id === 'custom' ? (customChar2Name || 'Person B') : character2.name;
    const char1Role = character1.id === 'custom' ? customChar1Role : character1.role;
    const char2Role = character2.id === 'custom' ? customChar2Role : character2.role;

    // Resolve scenario
    const scenarioTitle = selectedScenario.id === 'custom' ? customScenarioText : selectedScenario.title;
    const environment = selectedScenario.id === 'custom' ? customEnvironment : selectedScenario.environment;
    const tone = selectedScenario.tone;

    const lineCounts = { short: 10, medium: 18, long: 28 };
    const targetLines = lineCounts[scriptLength];

    const prompt = `
Generate a realistic, natural English conversation script between ${char1Name} (${char1Role}) and ${char2Name} (${char2Role}) in this scenario: ${scenarioTitle}.
The setting is: ${environment}.
The tone is ${tone}.
Target the script to be approximately ${targetLines} lines long.
The content MUST BE IN ENGLISH ONLY. Do not use any other language in the dialogue.

The student learning from this script speaks ${currentLanguage}, so you can include common polite technical or social phrases relevant to them, but keep the dialogue itself in natural sounding English.

RESPOND ONLY IN VALID JSON FORMAT:
{
  "title": "A descriptive title",
  "scenario": "A brief summary",
  "characters": ["${char1Name}", "${char2Name}"],
  "tone": "${tone}",
  "lines": [
    { "character": "Name", "characterEmoji": "Emoji", "dialogue": "Line text in English", "note": "Optional tip in English" }
  ],
  "vocabularyHighlights": [{ "word": "Word", "meaning": "Simple meaning in English" }],
  "usefulPhrases": ["Useful Phrase 1 in English"],
  "culturalNote": "Optional English note for learners"
}
`;

    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      if (!apiKey) throw new Error("API Key missing");

      const ai = new GoogleGenAI({ apiKey });
      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              scenario: { type: Type.STRING },
              characters: { type: Type.ARRAY, items: { type: Type.STRING } },
              tone: { type: Type.STRING },
              lines: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    character: { type: Type.STRING },
                    characterEmoji: { type: Type.STRING },
                    dialogue: { type: Type.STRING },
                    note: { type: Type.STRING }
                  },
                  required: ["character", "characterEmoji", "dialogue"]
                }
              },
              vocabularyHighlights: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    word: { type: Type.STRING },
                    meaning: { type: Type.STRING }
                  }
                }
              },
              usefulPhrases: { type: Type.ARRAY, items: { type: Type.STRING } },
              culturalNote: { type: Type.STRING }
            },
            required: ["title", "scenario", "characters", "tone", "lines", "vocabularyHighlights", "usefulPhrases"]
          }
        }
      });

      const rawText = response.text || '';
      if (!rawText || rawText === 'undefined') {
          throw new Error("AI returned empty content for script generation.");
      }
      const scriptText = rawText.replace(/```(json)?/gi, '').trim();
      let parsed: GeneratedScript;
      try {
        parsed = JSON.parse(scriptText);
      } catch (parseError) {
        console.error("Failed to parse script JSON:", scriptText, parseError);
        throw new Error("AI returned malformed script content.");
      }
      setGeneratedScript(parsed);
      setTranslatedContent(null);
      setShowTranslations(false);
      setPhase('READING');
    } catch (err: any) {
      console.error(err);
      if (isRateLimitError(err) && retryCount < 3) {
        await wait(Math.pow(2, retryCount) * 2000);
        return generateScript(retryCount + 1);
      }
      setError('Failed to generate script. Please try again.');
      setPhase('SETUP');
    }
  };

  const fetchTranslations = async (retryCount = 0) => {
    if (!generatedScript || translatedContent || currentLanguage === 'English') {
      setShowTranslations(true);
      return;
    }

    if (retryCount === 0) {
      setTranslating(true);
      setShowTranslations(true);
    }

    try {
      const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
      if (!apiKey) throw new Error("API Key missing");

      const ai = new GoogleGenAI({ apiKey });
      
      const dialogues = generatedScript.lines.map(l => l.dialogue);
      const vocabulary = generatedScript.vocabularyHighlights.map(v => `${v.word}: ${v.meaning}`);

      const prompt = `
        Translate the following English conversation lines and vocabulary definitions into ${currentLanguage}.
        Use the native script of ${currentLanguage} (e.g. Arabic, Urdu, Hindi, Chinese script).
        Keep the meaning faithful to the context of a conversation.
        
        DIALOGUES TO TRANSLATE:
        ${dialogues.join('\n---\n')}
        
        VOCABULARY TO TRANSLATE:
        ${vocabulary.join('\n---\n')}

        RESPOND ONLY WITH A JSON OBJECT:
        {
          "lines": ["translation of line 1", "translation of line 2", ...],
          "vocabulary": ["word: meaning translation 1", "word: meaning translation 2", ...]
        }
      `;

      const response = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: prompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              lines: { type: Type.ARRAY, items: { type: Type.STRING } },
              vocabulary: { type: Type.ARRAY, items: { type: Type.STRING } }
            },
            required: ["lines", "vocabulary"]
          }
        }
      });

      const rawTransText = response.text || '';
      if (!rawTransText || rawTransText === 'undefined') {
          throw new Error("AI returned empty content for script translation.");
      }
      const translatedText = rawTransText.replace(/```(json)?/gi, '').trim();
      let parsed;
      try {
        parsed = JSON.parse(translatedText);
      } catch (parseError) {
        console.error("Failed to parse translated script JSON:", translatedText, parseError);
        throw new Error("AI returned malformed translated script.");
      }
      setTranslatedContent(parsed);
      setTranslating(false);
    } catch (err: any) {
      console.error("Translation failed:", err);
      if (isRateLimitError(err) && retryCount < 3) {
        await wait(Math.pow(2, retryCount) * 2000);
        return fetchTranslations(retryCount + 1);
      }
      setTranslating(false);
    }
  };

  const copyLine = async (text: string, index: number) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedLine(index);
      setTimeout(() => setCopiedLine(null), 2000);
    } catch { /* ignore */ }
  };

  const downloadScript = () => {
    if (!generatedScript) return;
    const lines = generatedScript.lines
      .map(l => `${l.character}: ${l.dialogue}${l.note ? `\n  💡 ${l.note}` : ''}`)
      .join('\n\n');
    const vocab = generatedScript.vocabularyHighlights.map(v => `• ${v.word}: ${v.meaning}`).join('\n');
    const phrases = generatedScript.usefulPhrases.map(p => `• ${p}`).join('\n');
    const content = `
FLUENTO — CONVERSATION SCRIPT
================================
${generatedScript.title}
${generatedScript.scenario}
Tone: ${generatedScript.tone}

CONVERSATION:
--------------
${lines}

VOCABULARY HIGHLIGHTS:
-----------------------
${vocab}

USEFUL PHRASES TO REMEMBER:
-----------------------------
${phrases}

${generatedScript.culturalNote ? `CULTURAL NOTE:\n${generatedScript.culturalNote}` : ''}
    `.trim();
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `fluento-script-${Date.now()}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const categories = ['All', ...Array.from(new Set(PRESET_SCENARIOS.map(s => s.category)))];
  const filteredScenarios = PRESET_SCENARIOS.filter(s => 
    (activeCategory === 'All' || s.category === activeCategory) &&
    (s.title.toLowerCase().includes(searchQuery.toLowerCase()) || s.description.toLowerCase().includes(searchQuery.toLowerCase()))
  );

  return (
    <div className={`flex-1 flex flex-col h-full bg-deep-navy overflow-hidden ${langConfig.fontClass}`} dir={langConfig.rtl ? 'rtl' : 'ltr'}>
      <AnimatePresence mode="wait">
        {phase === 'SETUP' && (
          <motion.div 
            key="setup"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -20 }}
            className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar"
          >
            <div className="max-w-4xl mx-auto space-y-12 pb-20">
              {/* Header */}
              <div className="space-y-2 text-center md:text-left">
                <div className={`flex items-center gap-3 ${langConfig.rtl ? 'justify-end md:flex-row-reverse' : 'justify-center md:justify-start'}`}>
                  <div className="w-10 h-10 bg-electric-blue/10 rounded-lg flex items-center justify-center">
                    <Users className="text-electric-blue" size={24} />
                  </div>
                  <h1 className="text-2xl font-bold text-off-white">{t.scene_title}</h1>
                </div>
                <p className="text-gray-400 text-sm">{t.scene_subtitle}</p>
              </div>

              {/* Step 1: Characters */}
              <section className="space-y-6">
                <div className={`flex items-center gap-2 mb-4 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                  <div className="w-6 h-6 bg-sky-cyan/10 rounded-full flex items-center justify-center text-[10px] font-bold text-sky-cyan">1</div>
                  <h2 className="text-lg font-bold text-off-white">{t.scene_step1}</h2>
                </div>

                <div className={`flex flex-col md:flex-row items-center gap-6 ${langConfig.rtl ? 'md:flex-row-reverse' : ''}`}>
                  {/* Character 1 Panel */}
                  <div className="flex-1 w-full relative">
                    <button 
                      onClick={() => setShowPicker1(!showPicker1)}
                      className={`w-full p-6 rounded-2xl border-2 border-dashed transition-all text-left flex flex-col items-center justify-center gap-4 min-h-[200px] ${
                        character1 ? 'bg-slate-blue border-sky-cyan/50' : 'bg-slate-blue/40 border-white/5 hover:border-sky-cyan/30'
                      }`}
                    >
                      {character1 ? (
                        <>
                          <div className="text-5xl">{character1.emoji}</div>
                          <div className="text-center">
                            <div className="font-bold text-off-white text-lg">{character1.id === 'custom' ? (customChar1Name || t.scene_char_name_placeholder) : character1.name}</div>
                            <div className="text-sky-cyan text-sm">{character1.id === 'custom' ? (customChar1Role || t.scene_char_role_placeholder) : character1.role}</div>
                          </div>
                          <div 
                            onClick={(e) => { e.stopPropagation(); setCharacter1(null); }}
                            className={`absolute top-4 ${langConfig.rtl ? 'left-4' : 'right-4'} p-1.5 bg-slate-blue/50 rounded-full text-gray-500 hover:text-white`}
                          >
                            <X size={14} />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-500">
                            <Users size={24} />
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-off-white">{t.scene_char1_label}</div>
                            <div className="text-gray-500 text-xs">{t.scene_click_to_choose}</div>
                          </div>
                        </>
                      )}
                    </button>

                    <AnimatePresence>
                      {showPicker1 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute top-full mt-4 left-0 right-0 z-50 bg-slate-blue border border-sky-cyan/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[400px]"
                        >
                          <div className="p-4 border-b border-white/5 bg-deep-navy/30">
                            <div className="relative">
                              <Search className={`absolute ${langConfig.rtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-500`} size={16} />
                              <input 
                                type="text"
                                placeholder={t.scene_search_placeholder}
                                value={charSearch1}
                                onChange={(e) => setCharSearch1(e.target.value)}
                                className={`w-full bg-deep-navy border border-white/10 rounded-xl py-2 ${langConfig.rtl ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} text-sm outline-none focus:border-electric-blue transition-colors`}
                              />
                            </div>
                          </div>
                          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar grid grid-cols-2 gap-2">
                            {PRESET_CHARACTERS.filter(c => 
                              c.id !== character2?.id && 
                              (c.name.toLowerCase().includes(charSearch1.toLowerCase()) || c.role.toLowerCase().includes(charSearch1.toLowerCase()))
                            ).map(char => (
                              <button 
                                key={char.id}
                                onClick={() => { setCharacter1(char); setShowPicker1(false); }}
                                className={`p-3 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 active:scale-95 group ${langConfig.rtl ? 'text-right flex-row-reverse' : 'text-left'}`}
                              >
                                <span className="text-2xl group-hover:scale-110 transition-transform">{char.emoji}</span>
                                <div>
                                  <div className="text-sm font-bold text-off-white leading-tight">{char.name}</div>
                                  <div className="text-[10px] text-gray-500">{char.role}</div>
                                </div>
                              </button>
                            ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {character1?.id === 'custom' && !showPicker1 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3 p-4 bg-slate-blue rounded-xl border border-sky-cyan/20">
                        <input 
                          type="text" 
                          placeholder={t.scene_char_name_placeholder} 
                          value={customChar1Name} 
                          onChange={(e) => setCustomChar1Name(e.target.value)}
                          className={`w-full bg-deep-navy/50 border border-white/5 rounded-lg p-2 text-sm outline-none focus:border-sky-cyan ${langConfig.rtl ? 'text-right' : 'text-left'}`}
                        />
                        <input 
                          type="text" 
                          placeholder={t.scene_char_role_placeholder} 
                          value={customChar1Role} 
                          onChange={(e) => setCustomChar1Role(e.target.value)}
                          className={`w-full bg-deep-navy/50 border border-white/5 rounded-lg p-2 text-sm outline-none focus:border-sky-cyan ${langConfig.rtl ? 'text-right' : 'text-left'}`}
                        />
                      </motion.div>
                    )}
                  </div>

                  {/* VS Badge */}
                  <div className="w-10 h-10 rounded-full bg-slate-blue border border-white/10 flex items-center justify-center text-xs font-black text-gray-500 shrink-0">
                    VS
                  </div>

                  {/* Character 2 Panel */}
                  <div className="flex-1 w-full relative">
                    <button 
                      onClick={() => setShowPicker2(!showPicker2)}
                      className={`w-full p-6 rounded-2xl border-2 border-dashed transition-all text-left flex flex-col items-center justify-center gap-4 min-h-[200px] ${
                        character2 ? 'bg-slate-blue border-sky-cyan/50' : 'bg-slate-blue/40 border-white/5 hover:border-sky-cyan/30'
                      }`}
                    >
                      {character2 ? (
                        <>
                          <div className="text-5xl">{character2.emoji}</div>
                          <div className="text-center">
                            <div className="font-bold text-off-white text-lg">{character2.id === 'custom' ? (customChar2Name || t.scene_char_name_placeholder) : character2.name}</div>
                            <div className="text-sky-cyan text-sm">{character2.id === 'custom' ? (customChar2Role || t.scene_char_role_placeholder) : character2.role}</div>
                          </div>
                          <div 
                            onClick={(e) => { e.stopPropagation(); setCharacter2(null); }}
                            className={`absolute top-4 ${langConfig.rtl ? 'left-4' : 'right-4'} p-1.5 bg-slate-blue/50 rounded-full text-gray-500 hover:text-white`}
                          >
                            <X size={14} />
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center text-gray-500">
                            <Users size={24} />
                          </div>
                          <div className="text-center">
                            <div className="font-bold text-off-white">{t.scene_char2_label}</div>
                            <div className="text-gray-500 text-xs">{t.scene_click_to_choose}</div>
                          </div>
                        </>
                      )}
                    </button>

                    <AnimatePresence>
                      {showPicker2 && (
                        <motion.div 
                          initial={{ opacity: 0, y: 10, scale: 0.95 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: 10, scale: 0.95 }}
                          className="absolute top-full mt-4 left-0 right-0 z-50 bg-slate-blue border border-sky-cyan/30 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[400px]"
                        >
                          <div className="p-4 border-b border-white/5 bg-deep-navy/30">
                            <div className="relative">
                              <Search className={`absolute ${langConfig.rtl ? 'right-3' : 'left-3'} top-1/2 -translate-y-1/2 text-gray-500`} size={16} />
                              <input 
                                type="text"
                                placeholder={t.scene_search_placeholder}
                                value={charSearch2}
                                onChange={(e) => setCharSearch2(e.target.value)}
                                className={`w-full bg-deep-navy border border-white/10 rounded-xl py-2 ${langConfig.rtl ? 'pr-10 pl-4 text-right' : 'pl-10 pr-4 text-left'} text-sm outline-none focus:border-electric-blue transition-colors`}
                              />
                            </div>
                          </div>
                          <div className="flex-1 overflow-y-auto p-2 custom-scrollbar grid grid-cols-2 gap-2">
                            {PRESET_CHARACTERS.filter(c => 
                              c.id !== character1?.id && 
                              (c.name.toLowerCase().includes(charSearch2.toLowerCase()) || c.role.toLowerCase().includes(charSearch2.toLowerCase()))
                            ).map(char => (
                                <button 
                                  key={char.id}
                                  onClick={() => { setCharacter2(char); setShowPicker2(false); }}
                                  className={`p-3 rounded-xl hover:bg-white/5 transition-colors flex items-center gap-3 active:scale-95 group ${langConfig.rtl ? 'text-right flex-row-reverse' : 'text-left'}`}
                                >
                                  <span className="text-2xl group-hover:scale-110 transition-transform">{char.emoji}</span>
                                  <div>
                                    <div className="text-sm font-bold text-off-white leading-tight">{char.name}</div>
                                    <div className="text-[10px] text-gray-500">{char.role}</div>
                                  </div>
                                </button>
                              ))}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>

                    {character2?.id === 'custom' && !showPicker2 && (
                      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="mt-4 space-y-3 p-4 bg-slate-blue rounded-xl border border-sky-cyan/20">
                        <input 
                          type="text" 
                          placeholder={t.scene_char_name_placeholder} 
                          value={customChar2Name} 
                          onChange={(e) => setCustomChar2Name(e.target.value)}
                          className={`w-full bg-deep-navy/50 border border-white/5 rounded-lg p-2 text-sm outline-none focus:border-sky-cyan ${langConfig.rtl ? 'text-right' : 'text-left'}`}
                        />
                        <input 
                          type="text" 
                          placeholder={t.scene_char_role_placeholder} 
                          value={customChar2Role} 
                          onChange={(e) => setCustomChar2Role(e.target.value)}
                          className={`w-full bg-deep-navy/50 border border-white/5 rounded-lg p-2 text-sm outline-none focus:border-sky-cyan ${langConfig.rtl ? 'text-right' : 'text-left'}`}
                        />
                      </motion.div>
                    )}
                  </div>
                </div>
              </section>

              {/* Step 2: Scenario */}
              <section className="space-y-6">
                 <div className={`flex items-center gap-2 mb-4 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                  <div className="w-6 h-6 bg-sky-cyan/10 rounded-full flex items-center justify-center text-[10px] font-bold text-sky-cyan">2</div>
                  <h2 className="text-lg font-bold text-off-white">{t.scene_step2}</h2>
                </div>

                <div className="space-y-6">
                   <div className={`flex flex-col md:flex-row gap-4 ${langConfig.rtl ? 'md:flex-row-reverse' : ''}`}>
                      <div className="flex-1 relative">
                        <Search className={`absolute ${langConfig.rtl ? 'right-4' : 'left-4'} top-1/2 -translate-y-1/2 text-gray-500`} size={18} />
                        <input 
                          type="text"
                          placeholder={t.scene_search_scenario_placeholder}
                          value={searchQuery}
                          onChange={(e) => setSearchQuery(e.target.value)}
                          className={`w-full bg-slate-blue border border-white/10 rounded-2xl py-3.5 ${langConfig.rtl ? 'pr-12 pl-4 text-right' : 'pl-12 pr-4 text-left'} text-off-white outline-none focus:border-electric-blue transition-all shadow-xl`}
                        />
                      </div>
                      <div className={`flex gap-2 p-1 bg-slate-blue/50 rounded-2xl border border-white/5 overflow-x-auto whitespace-nowrap hide-scrollbar ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                         {categories.map(cat => (
                           <button
                             key={cat}
                             onClick={() => setActiveCategory(cat)}
                             className={`px-4 py-2.5 rounded-xl text-xs font-bold transition-all ${
                               activeCategory === cat ? 'bg-electric-blue text-deep-navy' : 'text-gray-400 hover:text-white'
                             }`}
                           >
                             {cat === 'All' ? t.scene_cat_all : cat}
                           </button>
                         ))}
                      </div>
                   </div>

                   <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredScenarios.map(scenario => (
                        <button
                          key={scenario.id}
                          onClick={() => setSelectedScenario(scenario)}
                          className={`p-6 rounded-2xl border transition-all relative group ${
                            selectedScenario?.id === scenario.id 
                              ? 'bg-electric-blue/10 border-electric-blue shadow-[0_0_20px_rgba(41,121,255,0.15)]' 
                              : 'bg-slate-blue border-white/5 hover:border-sky-cyan/30 hover:bg-slate-blue/80'
                          } ${langConfig.rtl ? 'text-right' : 'text-left'}`}
                        >
                          {selectedScenario?.id === scenario.id && (
                            <div className={`absolute top-4 ${langConfig.rtl ? 'left-4' : 'right-4'} w-5 h-5 bg-electric-blue rounded-full flex items-center justify-center`}>
                              <Check size={12} className="text-deep-navy" />
                            </div>
                          )}
                          <div className={`text-3xl mb-4 group-hover:scale-110 transition-transform ${langConfig.rtl ? 'origin-right' : 'origin-left'}`}>{scenario.emoji}</div>
                          <div className="font-bold text-off-white mb-1">{scenario.title}</div>
                          <div className="text-xs text-gray-500 line-clamp-2 leading-relaxed">{scenario.description}</div>
                          <div className={`mt-4 flex items-center gap-2 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                             <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded-md ${
                               scenario.tone === 'formal' ? 'bg-purple-500/10 text-purple-400' :
                               scenario.tone === 'semi-formal' ? 'bg-blue-500/10 text-blue-400' :
                               'bg-emerald-500/10 text-emerald-400'
                             }`}>
                               {scenario.tone === 'formal' ? t.scene_tone_formal : 
                                scenario.tone === 'semi-formal' ? t.scene_tone_semi : 
                                t.scene_tone_casual}
                             </span>
                          </div>
                        </button>
                      ))}
                   </div>
                </div>

                {selectedScenario?.id === 'custom' && (
                  <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-4 p-6 bg-slate-blue rounded-3xl border border-sky-cyan/20">
                     <div className="space-y-2">
                        <label className={`text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 ${langConfig.rtl ? 'text-right block' : ''}`}>{t.scene_custom_situation_label}</label>
                        <input 
                          type="text" 
                          placeholder={t.scene_custom_situation_placeholder}
                          value={customScenarioText}
                          onChange={(e) => setCustomScenarioText(e.target.value)}
                          className={`w-full bg-deep-navy/50 border border-white/5 rounded-xl p-4 text-off-white outline-none focus:border-electric-blue transition-all ${langConfig.rtl ? 'text-right' : ''}`}
                        />
                     </div>
                     <div className="space-y-2">
                        <label className={`text-xs font-bold text-gray-500 uppercase tracking-widest ml-1 ${langConfig.rtl ? 'text-right block' : ''}`}>{t.scene_custom_environment_label}</label>
                        <input 
                          type="text" 
                          placeholder={t.scene_custom_environment_placeholder}
                          value={customEnvironment}
                          onChange={(e) => setCustomEnvironment(e.target.value)}
                          className={`w-full bg-deep-navy/50 border border-white/5 rounded-xl p-4 text-off-white outline-none focus:border-electric-blue transition-all ${langConfig.rtl ? 'text-right' : ''}`}
                        />
                     </div>
                  </motion.div>
                )}
              </section>

              {/* Step 3: Options */}
              <section className="space-y-6">
                 <div className={`flex items-center gap-2 mb-4 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                  <div className="w-6 h-6 bg-sky-cyan/10 rounded-full flex items-center justify-center text-[10px] font-bold text-sky-cyan">3</div>
                  <h2 className="text-lg font-bold text-off-white">{t.scene_step3}</h2>
                </div>

                <div className="bg-slate-blue/30 rounded-3xl p-6 border border-white/5 space-y-8">
                   <div className="space-y-4">
                      <div className={`flex items-center gap-2 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                        <Settings size={16} className="text-gray-500" />
                        <span className="text-sm font-bold text-off-white">{t.scene_length_label}</span>
                      </div>
                      <div className={`flex gap-2 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                        {(['short', 'medium', 'long'] as const).map(len => (
                          <button
                            key={len}
                            onClick={() => setScriptLength(len)}
                            className={`flex-1 py-3 rounded-xl text-xs font-bold capitalize transition-all ${
                              scriptLength === len ? 'bg-electric-blue text-deep-navy shadow-lg shadow-electric-blue/20' : 'bg-slate-blue border border-white/5 text-gray-500 hover:text-white'
                            }`}
                          >
                            {len === 'short' ? t.scene_length_short : len === 'medium' ? t.scene_length_medium : t.scene_length_long}
                            <span className="block opacity-50 font-normal mt-0.5">
                              {len === 'short' ? `10 ${t.scene_lines_label}` : len === 'medium' ? `18 ${t.scene_lines_label}` : `28 ${t.scene_lines_label}`}
                            </span>
                          </button>
                        ))}
                      </div>
                   </div>

                   <div className={`flex items-start gap-4 p-4 bg-deep-navy/40 rounded-2xl ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                      <Globe className="text-sky-cyan shrink-0" size={20} />
                      <p className={`text-xs text-gray-500 leading-relaxed italic ${langConfig.rtl ? 'text-right' : 'text-left'}`}>
                        {t.scene_footer_note}
                      </p>
                   </div>
                </div>
              </section>

              {/* Error Header */}
              {error && (
                <div className={`p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl text-rose-400 text-sm flex items-center gap-3 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                  <X size={18} /> {error}
                </div>
              )}

              {/* Action Button */}
              <div className="space-y-4 pt-10">
                <button 
                  onClick={() => generateScript()}
                  disabled={!character1 || !character2 || !selectedScenario}
                  className="w-full py-5 bg-gradient-to-r from-electric-blue to-sky-cyan text-deep-navy font-black text-lg rounded-2xl shadow-2xl flex items-center justify-center gap-3 hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-20 disabled:grayscale disabled:scale-100"
                >
                  <Sparkles size={24} /> {t.scene_generate_button}
                </button>
                {!(!character1 || !character2 || !selectedScenario) && (
                  <p className="text-center text-xs text-gray-500">
                    {character1?.emoji} {character1?.name} and {character2?.emoji} {character2?.name} in {selectedScenario?.emoji} {selectedScenario?.title}
                  </p>
                )}
              </div>
            </div>
          </motion.div>
        )}

        {phase === 'GENERATING' && (
          <motion.div 
            key="generating"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="flex-1 flex flex-col items-center justify-center p-8 bg-deep-navy text-center"
          >
            <div className="relative mb-12">
               <motion.div 
                 animate={{ scale: [1, 1.2, 1], opacity: [1, 0.6, 1] }}
                 transition={{ repeat: Infinity, duration: 2 }}
                 className="w-24 h-24 bg-electric-blue/10 rounded-full flex items-center justify-center"
               >
                 <Sparkles size={48} className="text-electric-blue" />
               </motion.div>
               <motion.div 
                  animate={{ rotate: 360 }}
                  transition={{ repeat: Infinity, duration: 4, ease: 'linear' }}
                  className="absolute inset-x-0 inset-y-0 border-2 border-dashed border-sky-cyan/30 rounded-full"
               />
            </div>
            
            <h2 className="text-3xl font-black text-off-white mb-4">{t.scene_writing_title}</h2>
            <div className="space-y-1 mb-12">
               <p className="text-gray-400">{t.scene_writing_subtitle}</p>
               <p className="text-electric-blue font-bold">{character1?.emoji} {character1?.name} & {character2?.emoji} {character2?.name} — {selectedScenario?.title}</p>
            </div>

            <div className="h-2 w-48 bg-white/5 rounded-full overflow-hidden mx-auto mb-6">
               <motion.div 
                 initial={{ x: '-100%' }}
                 animate={{ x: '100%' }}
                 transition={{ repeat: Infinity, duration: 1.5, ease: 'linear' }}
                 className="h-full w-1/2 bg-sky-cyan"
               />
            </div>

            <AnimatePresence mode="wait">
              <motion.p 
                key={generatingMessage}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="text-sky-cyan text-sm italic font-medium"
              >
                {generatingMessage === 'Writing natural dialogue...' ? t.scene_gen_msg_1 :
                 generatingMessage === 'Adding vocabulary highlights...' ? t.scene_gen_msg_2 :
                 generatingMessage === 'Making it relevant for you...' ? t.scene_gen_msg_3 :
                 t.scene_gen_msg_4}
              </motion.p>
            </AnimatePresence>
          </motion.div>
        )}

        {phase === 'READING' && generatedScript && (
          <motion.div 
            key="reading"
            initial={{ opacity: 0, x: 20 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -20 }}
            className="flex-1 flex flex-col overflow-hidden"
          >
            {/* Reading Header */}
            <header className={`p-4 bg-slate-blue/80 backdrop-blur-sm border-b border-white/5 flex items-center justify-between z-10 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
              <div className={`flex items-center gap-3 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                 <button 
                  onClick={() => setPhase('SETUP')}
                  className="p-2 hover:bg-white/10 rounded-lg text-gray-400 transition-colors"
                 >
                   {langConfig.rtl ? <ArrowRight size={20} /> : <ArrowLeft size={20} />}
                 </button>
                 <div className={langConfig.rtl ? 'text-right' : 'text-left'}>
                    <h3 className="text-off-white font-bold leading-tight truncate max-w-[200px] sm:max-w-xs">{generatedScript.title}</h3>
                    <div className={`flex items-center gap-2 ${langConfig.rtl ? 'justify-end' : ''}`}>
                       <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded ${
                         generatedScript.tone.toLowerCase().includes('formal') ? 'bg-purple-500/20 text-purple-400' : 
                         generatedScript.tone.toLowerCase().includes('casual') ? 'bg-emerald-500/20 text-emerald-400' : 
                         'bg-blue-500/20 text-blue-400'
                       }`}>
                         {generatedScript.tone}
                       </span>
                    </div>
                 </div>
              </div>
              <div className={`flex items-center gap-2 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                 <button 
                   onClick={downloadScript}
                   className={`p-2 sm:px-4 sm:py-2 bg-slate-blue border border-white/10 rounded-xl text-xs font-bold text-off-white flex items-center gap-2 hover:bg-white/5 transition-all ${langConfig.rtl ? 'flex-row-reverse' : ''}`}
                 >
                    <Download size={16} /> <span className="hidden sm:inline">{t.scene_download}</span>
                 </button>
                 <button 
                   onClick={() => setPhase('SETUP')}
                   className={`p-2 sm:px-4 sm:py-2 bg-electric-blue text-deep-navy rounded-xl text-xs font-bold flex items-center gap-2 hover:brightness-110 active:scale-95 transition-all ${langConfig.rtl ? 'flex-row-reverse' : ''}`}
                 >
                    <RotateCcw size={16} /> <span className="hidden sm:inline">{t.scene_new_script}</span>
                 </button>
              </div>
            </header>

            <div className="flex-1 overflow-y-auto p-4 md:p-8 custom-scrollbar">
              <div className="max-w-3xl mx-auto space-y-10 pb-20">
                {/* Scenario Overview */}
                <div className="bg-slate-blue border border-sky-cyan/20 p-6 rounded-3xl shadow-xl space-y-4">
                  <div className={`flex items-start gap-4 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                     <div className="text-4xl p-4 bg-deep-navy/40 rounded-2xl shrink-0">
                       {selectedScenario?.emoji}
                     </div>
                     <div className={`space-y-1 flex-1 ${langConfig.rtl ? 'text-right' : 'text-left'}`}>
                        <div className="text-xs uppercase font-black text-sky-cyan tracking-widest">{t.scene_details_title}</div>
                        <p className="text-off-white font-medium leading-relaxed">{generatedScript.scenario}</p>
                        <div className={`flex items-center gap-2 text-xs text-gray-500 ${langConfig.rtl ? 'justify-end' : ''}`}>
                           <MapPin size={12} /> {selectedScenario?.environment}
                        </div>
                     </div>
                  </div>
                  
                  <div className={`flex flex-wrap gap-3 pt-2 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                    <div className={`flex items-center gap-2 bg-deep-navy/30 px-3 py-1.5 rounded-full border border-white/5 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                       <span className="text-lg">{character1?.emoji}</span>
                       <span className="text-xs font-bold text-gray-400">{character1?.name} — {character1?.role}</span>
                    </div>
                    <div className={`flex items-center gap-2 bg-deep-navy/30 px-3 py-1.5 rounded-full border border-white/5 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                       <span className="text-lg">{character2?.emoji}</span>
                       <span className="text-xs font-bold text-gray-400">{character2?.name} — {character2?.role}</span>
                    </div>
                  </div>
                </div>

                {/* The Script */}
                <div className="space-y-6">
                   <div className={`flex items-center gap-3 mb-8 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                      <MessageSquare className="text-electric-blue" size={20} />
                      <h4 className="text-lg font-bold text-off-white tracking-tight">{t.scene_script_title}</h4>
                   </div>

                   <div className="space-y-4">
                      {generatedScript.lines.map((line, i) => {
                        const isFirstChar = line.character === generatedScript.characters[0];
                        // In RTL mode, "FirstChar" should be on the right if it's considered "start"
                        // But let's keep logic simple: isFirstChar = left-aligned (ltr) or right-aligned (rtl)
                        return (
                          <motion.div 
                            key={i}
                            initial={{ opacity: 0, x: isFirstChar ? (langConfig.rtl ? 20 : -20) : (langConfig.rtl ? -20 : 20) }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.05 }}
                            className={`flex flex-col ${isFirstChar ? 'items-start' : 'items-end'}`}
                          >
                             <div className={`flex items-center gap-2 mb-1.5 ${isFirstChar ? (langConfig.rtl ? 'mr-4 flex-row-reverse' : 'ml-4') : (langConfig.rtl ? 'ml-4' : 'mr-4 flex-row-reverse')}`}>
                                <span className="text-xs font-black text-gray-500 uppercase tracking-tighter">{line.characterEmoji} {line.character}</span>
                             </div>
                             <div className="group relative max-w-[85%]">
                                <div className={`p-4 rounded-3xl text-sm leading-relaxed ${
                                  isFirstChar 
                                    ? `bg-slate-blue border border-white/5 ${langConfig.rtl ? 'rounded-tr-none' : 'rounded-tl-none'} shadow-lg` 
                                    : `bg-electric-blue/10 border border-electric-blue/20 ${langConfig.rtl ? 'rounded-tl-none text-right' : 'rounded-tr-none text-left'} shadow-lg text-off-white`
                                }`}>
                                   {line.dialogue}

                                   {line.note && (
                                     <div className={`mt-3 pt-3 border-t border-white/5 flex items-start gap-2 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                                        <div className="p-1 bg-amber-500/20 rounded shrink-0">
                                          <BookOpen className="text-amber-500" size={10} />
                                        </div>
                                        <p className={`text-[11px] italic text-amber-500/90 leading-tight ${langConfig.rtl ? 'text-right' : 'text-left'}`}>{line.note}</p>
                                     </div>
                                   )}
                                </div>
                                <button 
                                  onClick={() => copyLine(line.dialogue, i)}
                                  className={`absolute top-2 ${langConfig.rtl ? 'left-2' : 'right-2'} p-2 bg-deep-navy/80 backdrop-blur-md rounded-lg text-gray-400 opacity-0 group-hover:opacity-100 transition-all hover:text-white`}
                                >
                                  {copiedLine === i ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
                                </button>
                                {copiedLine === i && (
                                  <div className={`absolute -top-8 ${langConfig.rtl ? 'left-0' : 'right-0'} bg-emerald-500 text-deep-navy text-[10px] font-bold px-2 py-1 rounded shadow-lg animate-bounce`}>
                                    {t.scene_copied}
                                  </div>
                                )}
                             </div>
                             <span className={`text-[9px] font-mono text-gray-700 mt-1 ${isFirstChar ? (langConfig.rtl ? 'mr-4' : 'ml-4') : (langConfig.rtl ? 'ml-4' : 'mr-4')}`}>#{String(i+1).padStart(2, '0')}</span>
                          </motion.div>
                        );
                      })}
                   </div>
                </div>

                {/* Vocabulary & Culture */}
                <div className={`grid grid-cols-1 md:grid-cols-2 gap-6 ${langConfig.rtl ? 'md:flex-row-reverse' : ''}`}>
                   {/* Vocab */}
                   <div className="bg-slate-blue/40 border border-white/5 p-6 rounded-3xl space-y-6">
                      <div className={`flex items-center gap-2 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                        <BookOpen className="text-sky-cyan" size={18} />
                        <h5 className="font-bold text-off-white">{t.scene_vocab_title}</h5>
                      </div>
                      <div className="space-y-4">
                         {generatedScript.vocabularyHighlights.map((v, i) => (
                           <div key={i} className="group">
                              <div className={`text-sky-cyan font-bold text-sm mb-0.5 transition-transform ${langConfig.rtl ? 'text-right group-hover:-translate-x-1' : 'text-left group-hover:translate-x-1'}`}>{v.word}</div>
                              <div className={`text-xs text-gray-500 leading-normal ${langConfig.rtl ? 'text-right' : 'text-left'}`}>{v.meaning}</div>
                           </div>
                         ))}
                      </div>
                   </div>

                   {/* Phrases */}
                   <div className="bg-slate-blue/40 border border-white/5 p-6 rounded-3xl space-y-6">
                      <div className={`flex items-center gap-2 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                        <MessageSquare className="text-electric-blue" size={18} />
                        <h5 className="font-bold text-off-white">{t.scene_phrases_title}</h5>
                      </div>
                      <div className="space-y-2">
                        {generatedScript.usefulPhrases.map((phrase, i) => (
                          <div key={i} className={`flex items-center justify-between p-3 bg-deep-navy/30 rounded-xl border border-white/5 group hover:border-electric-blue/40 transition-colors ${langConfig.rtl ? 'flex-row-reverse text-right' : 'text-left'}`}>
                             <span className="text-xs text-gray-300 font-medium">"{phrase}"</span>
                             <button onClick={() => copyLine(phrase, 999)} className="text-gray-600 hover:text-electric-blue">
                               <Copy size={12} />
                             </button>
                          </div>
                        ))}
                      </div>
                   </div>
                </div>

                {/* Cultural Note */}
                {generatedScript.culturalNote && (
                  <div className={`bg-amber-500/5 border-l-4 border-amber-500 p-6 rounded-r-3xl space-y-3 ${langConfig.rtl ? 'border-l-0 border-r-4 rounded-r-none rounded-l-3xl text-right' : ''}`}>
                     <div className={`flex items-center gap-2 ${langConfig.rtl ? 'flex-row-reverse' : ''}`}>
                        <span className="text-xl">{langConfig.flag}</span>
                        <h5 className="font-bold text-amber-500 text-sm uppercase tracking-widest">{t.scene_cultural_note_title}</h5>
                     </div>
                     <p className="text-sm text-gray-400 leading-relaxed italic">
                        {generatedScript.culturalNote}
                     </p>
                  </div>
                )}

                {/* Footer Actions */}
                <div className="pt-10 space-y-4">
                   <button 
                     onClick={() => {
                        if (onPractice && generatedScript) {
                          onPractice({
                            title: generatedScript.title,
                            scenario: generatedScript.scenario,
                            lines: generatedScript.lines.map(l => ({ character: l.character, dialogue: l.dialogue }))
                          });
                        }
                     }}
                     className="w-full py-5 bg-slate-blue hover:bg-slate-blue/80 text-off-white font-bold rounded-2xl border border-sky-cyan/30 flex items-center justify-center gap-3 active:scale-95 transition-all shadow-xl"
                   >
                      <Volume2 size={24} className="text-sky-cyan" /> {t.scene_practice_button}
                   </button>
                   <div className={`flex flex-col sm:flex-row gap-3 ${langConfig.rtl ? 'sm:flex-row-reverse' : ''}`}>
                      <button 
                         onClick={() => generateScript()}
                         className="flex-1 py-4 bg-deep-navy text-sky-cyan font-bold rounded-2xl border border-sky-cyan/20 flex items-center justify-center gap-2 hover:bg-sky-cyan/5 transition-all"
                      >
                         <RotateCcw size={18} /> {t.scene_variation_button}
                      </button>
                      <button 
                         onClick={() => setPhase('SETUP')}
                         className="flex-1 py-4 bg-deep-navy text-gray-400 font-bold rounded-2xl border border-white/5 flex items-center justify-center gap-2 hover:bg-white/5 transition-all"
                      >
                         <Settings size={18} /> {t.scene_change_button}
                      </button>
                   </div>
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

export default ConversationScriptPage;
