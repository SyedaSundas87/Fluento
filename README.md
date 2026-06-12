<div align="center">

# 🎙️ FLUENTO

### AI-Powered Language Learning Through Real-Time Voice Conversations

[![React](https://img.shields.io/badge/React-19-61DAFB?style=flat-square&logo=react)](https://react.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-3178C6?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?style=flat-square&logo=vite)](https://vitejs.dev/)
[![Gemini](https://img.shields.io/badge/Gemini_API-Live-4285F4?style=flat-square&logo=google)](https://ai.google.dev/)
[![License](https://img.shields.io/badge/License-MIT-green?style=flat-square)](LICENSE)

**Fluento** is a voice-first language learning app that pairs you with an AI tutor for real-time spoken conversations. Improve fluency, build vocabulary, sharpen your accent, and track your progress — all in one place, across 9 languages.

[Features](#-features) · [Getting Started](#-getting-started) · [Tech Stack](#-tech-stack) · [Project Structure](#-project-structure) · [Roadmap](#-roadmap)

</div>

---

## ✨ Features

### 🗣️ AI Conversation Tutor
Hold live, voice-to-voice conversations with an AI tutor powered by the **Gemini Live API**. The tutor listens in real time, speaks back naturally, and corrects your grammar inline — right inside the transcript. Choose from four conversation modes:
- **Casual Chat** — relaxed everyday practice
- **Interview Practice** — sharpen professional English
- **Travel Talk** — real-world travel scenarios
- **Exam Prep** — structured academic language

A **session summary banner** appears at the end of each session with your correction count and a filler-word analysis (e.g., overuse of *"um"*, *"like"*, *"you know"*).

### 🔥 Daily Challenge
A new speaking prompt every day, drawn from 30+ real-life topics (job interviews, food, current events, and more). A 2-minute countdown timer keeps sessions focused. Your **streak** is tracked automatically — current and longest streak — to keep motivation high. Challenges are auto-translated for non-English learners.

### 📚 Vocabulary Builder
Receive a fresh set of AI-generated vocabulary words tailored to your target language every day. Each word comes with a definition and a usage example. Words are cached locally so they're available offline after first load. From the vocabulary list, you can launch a **flashcard-style quiz** to reinforce what you've learned.

### 🎯 Accent Coach
Record yourself reading a Gemini-generated sentence in your target language. The AI listens, transcribes what you said, scores your pronunciation out of 100, and delivers specific, actionable feedback. Progress is saved to your profile over time.

### 🌐 Live Translator
Speak in any language and hear a real-time translated response in another. Supports bidirectional translation across all 9 supported languages using the Gemini Live API for audio and the built-in TTS models for playback.

### 📊 Language Assessment (CEFR)
A structured 4-stage speaking test:
1. **Read Aloud** — assess basic pronunciation and fluency
2. **Repeat After Me** — test listening comprehension and recall
3. **Picture Description** — evaluate spontaneous speech
4. **Opinion Question** — measure argumentative language skills

After completing all stages, you receive an overall score, a **CEFR level** (A1–C2), identified strengths and areas for improvement, and a personalized study recommendation.

### 🎭 Scene Practice (Script Mode)
Browse pre-written conversation scripts across real-world scenarios. Step into a character, practice the scene line by line, and then carry the conversation forward freely with the AI.

### 📈 Progress Dashboard
A personal dashboard tracking:
- Total conversation sessions and grammar corrections received
- Vocabulary sessions completed
- Accent practice sessions and average pronunciation score over time

---

## 🌍 Supported Languages

| Language | Code | Voice |
|---|---|---|
| 🇬🇧 English | `en-US` | Zephyr |
| 🇪🇸 Spanish | `es-ES` | Puck |
| 🇫🇷 French | `fr-FR` | Charon |
| 🇩🇪 German | `de-DE` | Charon |
| 🇰🇷 Korean | `ko-KR` | Kore |
| 🇯🇵 Japanese | `ja-JP` | Kore |
| 🇨🇳 Chinese | `zh-CN` | Puck |
| 🇸🇦 Arabic | `ar-SA` | Fenrir |
| 🇵🇰 Urdu | `ur-PK` | Zephyr |

---

## 🚀 Getting Started

### Prerequisites

- **Node.js** v18 or higher
- A **Gemini API key** — get one free at [aistudio.google.com](https://aistudio.google.com/app/apikey)
- A browser with microphone access (Chrome recommended for best Web Speech API support)

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/your-username/fluento.git
cd fluento

# 2. Install dependencies
npm install

# 3. Set up your API key
cp .env.local.example .env.local
# Then edit .env.local and add your key:
# GEMINI_API_KEY=your_api_key_here

# 4. Start the development server
npm run dev
```

The app will be available at **http://localhost:3000**.

### Build for Production

```bash
npm run build
npm run preview
```

### Lint / Type Check

```bash
npm run lint
```

---

## 🛠️ Tech Stack

| Category | Technology |
|---|---|
| **Frontend Framework** | React 19 |
| **Language** | TypeScript 5.8 |
| **Build Tool** | Vite 6 |
| **AI / LLM** | Google Gemini API (`@google/genai`) |
| **Real-Time Audio** | Gemini Live API + Web Audio API |
| **Text-to-Speech** | Gemini TTS (`gemini-3.1-flash-tts-preview`) |
| **Animations** | Motion (Framer Motion) |
| **Icons** | Lucide React |
| **Auth & Storage** | localStorage (client-side) |

### AI Models Used

| Model | Purpose |
|---|---|
| `gemini-live-*` | Real-time voice conversation (streaming audio) |
| `gemini-3.1-flash-tts-preview` | High-quality TTS for vocabulary pronunciation and translation |
| `gemini-3-flash-preview` | Vocabulary generation, assessment scoring, sentence generation |

---

## 📁 Project Structure

```
fluento/
├── components/
│   ├── Sidebar.tsx              # Navigation sidebar with language/mode selectors
│   ├── TranscriptView.tsx       # Real-time conversation transcript display
│   ├── SessionSummaryBanner.tsx # Post-session stats and filler word report
│   └── FillerWordBadge.tsx      # Inline badge for detected filler words
│
├── pages/
│   ├── ConversationPage.tsx     # Core AI voice conversation experience
│   ├── DailyChallengePage.tsx   # Daily speaking prompt with streak tracking
│   ├── VocabularyPage.tsx       # Daily vocabulary cards
│   ├── VocabularyQuizPage.tsx   # Flashcard quiz for vocabulary reinforcement
│   ├── AccentCoachPage.tsx      # Pronunciation scoring and feedback
│   ├── TranslatorPage.tsx       # Live voice-to-voice translator
│   ├── AssessmentPage.tsx       # 4-stage CEFR speaking assessment
│   ├── ConversationScriptPage.tsx # Scripted scene practice browser
│   ├── ProgressPage.tsx         # Personal stats dashboard
│   ├── LoginPage.tsx            # Authentication
│   └── SignupPage.tsx           # New account registration
│
├── hooks/
│   ├── useLanguage.tsx          # Language context provider
│   └── useTheme.ts              # Theme utilities
│
├── utils/
│   ├── audioUtils.ts            # Web Audio API helpers (decode, playback)
│   ├── auth.ts                  # localStorage-based auth (sign up, sign in, session)
│   ├── progress.ts              # Progress tracking helpers
│   ├── dailyChallenge.ts        # Challenge generation and streak logic
│   ├── fillerWordUtils.ts       # Filler word detection and scoring
│   ├── languageConfig.ts        # Per-language config (RTL, speech codes, fonts)
│   ├── translations.ts          # UI string translations across all languages
│   └── errorUtils.ts            # Rate-limit detection and retry helpers
│
├── constants/
│   └── assessmentData.ts        # Question banks for the CEFR assessment
│
├── config.ts                    # Language and conversation mode definitions
├── types.ts                     # Shared TypeScript types and enums
├── App.tsx                      # Root component and router
├── index.tsx                    # React entry point
└── vite.config.ts               # Vite build configuration
```

---

## ⚙️ Configuration

### Adding a New Language

Edit `config.ts` to add a language entry:

```typescript
{ name: 'Italian', code: 'it-IT', flag: '🇮🇹', voice: 'Puck' }
```

Then add its display config to `utils/languageConfig.ts` and any necessary UI translations to `utils/translations.ts`.

### Conversation Modes

Conversation modes (Casual Chat, Interview Practice, etc.) are defined in `config.ts` under the `MODES` array. Each mode shapes the AI tutor's system prompt inside `ConversationPage.tsx`.

---

## 🔒 Authentication & Data

Fluento uses **client-side localStorage** for auth and data persistence — no backend server required. This means:

- User accounts and sessions are stored in the browser
- All progress data stays on-device
- Clearing browser data will reset all progress

> **Note:** For a production deployment, replace the `utils/auth.ts` implementation with a proper backend authentication service and a secure database for user progress.

---

## 📋 Environment Variables

| Variable | Description |
|---|---|
| `GEMINI_API_KEY` | Your Google Gemini API key (required) |
| `API_KEY` | Alias for `GEMINI_API_KEY` (either works) |

Create a `.env.local` file in the project root:

```env
GEMINI_API_KEY=your_gemini_api_key_here
```

---

## 🗺️ Roadmap

- [ ] Backend authentication and cloud-synced progress
- [ ] Spaced repetition system for vocabulary review
- [ ] Expanded script library for scene practice
- [ ] Leaderboards and social challenges
- [ ] Mobile app (React Native)
- [ ] Offline mode for vocabulary and assessment
- [ ] Support for Hindi, Turkish, and additional languages

---

## 🤝 Contributing

Contributions are welcome! Please open an issue to discuss your idea before submitting a pull request.

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature-name`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature-name`
5. Open a pull request

---

## 📄 License

This project is licensed under the MIT License. See the [LICENSE](LICENSE) file for details.

---

<div align="center">
Built with ❤️ using React, TypeScript, and the Google Gemini API
</div>
