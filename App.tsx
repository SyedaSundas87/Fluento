import React, { useState, useEffect } from 'react';
import { KeyRound, TrendingUp, Menu, X, Bot } from 'lucide-react';
import { LANGUAGES, MODES } from './config';
import { type Language, type Mode, type User, type VocabularyWord } from './types';
import Sidebar from './components/Sidebar';
import ConversationPage from './pages/ConversationPage';
import VocabularyPage from './pages/VocabularyPage';
import TranslatorPage from './pages/TranslatorPage';
import AccentCoachPage from './pages/AccentCoachPage';
import LoginPage from './pages/LoginPage';
import SignupPage from './pages/SignupPage';
import ProgressPage from './pages/ProgressPage';
import AssessmentPage from './pages/AssessmentPage';
import DailyChallengePage from './pages/DailyChallengePage';
import VocabularyQuizPage from './pages/VocabularyQuizPage';
import ConversationScriptPage from './pages/ConversationScriptPage';
import { getCurrentUser, signOut } from './utils/auth';


declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
    webkitAudioContext?: typeof AudioContext;
  }
}

type Page = 'conversation' | 'vocabulary' | 'translator' | 'accent' | 'progress' | 'assessment' | 'challenge' | 'vocabulary-quiz' | 'scene-practice';

import { LanguageProvider } from './hooks/useLanguage';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authPage, setAuthPage] = useState<'login' | 'signup'>('login');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  
  const [activePage, setActivePage] = useState<Page>('challenge');
  
  const [selectedLanguage, setSelectedLanguage] = useState(() => {
    const saved = localStorage.getItem('fluento_language');
    if (saved) {
      const found = LANGUAGES.find(l => l.name === saved);
      if (found) return found;
    }
    return LANGUAGES[0];
  });
  
  const [selectedMode, setSelectedMode] = useState(MODES[0]);
  const [quizWords, setQuizWords] = useState<VocabularyWord[]>([]);
  const [activeScript, setActiveScript] = useState<{ title: string; scenario: string; lines: { character: string; dialogue: string }[] } | null>(null);

  useEffect(() => {
    localStorage.setItem('fluento_language', selectedLanguage.name);
  }, [selectedLanguage]);

  useEffect(() => {
    const initializeApp = async () => {
      // Check for logged in user
      const user = getCurrentUser();
      if (user) {
        setCurrentUser(user);
      }
      setIsLoading(false);
    };
    initializeApp();
  }, []);

  const handleAuthSuccess = (user: User) => {
    setCurrentUser(user);
    setActivePage('conversation');
  };

  const handleSignOut = () => {
    signOut();
    setCurrentUser(null);
    setAuthPage('login'); // Reset to login page on logout
    setActivePage('conversation'); // Reset to default page on logout
  };

  const renderActivePage = () => {
    if (!currentUser) return null;
    switch (activePage) {
      case 'conversation':
        return (
          <ConversationPage 
            user={currentUser} 
            selectedLanguage={selectedLanguage} 
            selectedMode={selectedMode} 
            initialScript={activeScript || undefined}
          />
        );
      case 'vocabulary':
        return <VocabularyPage user={currentUser} selectedLanguage={selectedLanguage} setQuizWords={setQuizWords} setActivePage={setActivePage} />;
      case 'vocabulary-quiz':
        return (
          <VocabularyQuizPage 
            user={currentUser} 
            selectedLanguage={selectedLanguage} 
            words={quizWords} 
            onExit={() => setActivePage('vocabulary')}
            onNewWords={() => {
              const today = new Date().toISOString().split('T')[0];
              localStorage.removeItem(`vocabulary_${selectedLanguage.code}_${today}_v2`);
              setActivePage('vocabulary');
            }}
          />
        );
      case 'translator':
        return <TranslatorPage />;
      case 'accent':
        return <AccentCoachPage user={currentUser} selectedLanguage={selectedLanguage} />;
      case 'progress':
        return <ProgressPage user={currentUser} />;
      case 'assessment':
        return <AssessmentPage user={currentUser} selectedLanguage={selectedLanguage} />;
      case 'challenge':
        return <DailyChallengePage user={currentUser} selectedLanguage={selectedLanguage} />;
      case 'scene-practice':
        return (
          <ConversationScriptPage 
            onPractice={(script) => {
              setActiveScript(script);
              setActivePage('conversation');
            }}
          />
        );
      default:
        return <ConversationPage user={currentUser} selectedLanguage={selectedLanguage} selectedMode={selectedMode} />;
    }
  };

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen text-off-white">Loading...</div>;
  }

  if (!currentUser) {
    return authPage === 'login' ? (
      <LoginPage onLogin={handleAuthSuccess} onSwitchToSignup={() => setAuthPage('signup')} />
    ) : (
      <SignupPage onSignup={handleAuthSuccess} onSwitchToLogin={() => setAuthPage('login')} />
    );
  }

  return (
    <LanguageProvider language={selectedLanguage.name}>
      <div className="flex h-screen text-off-white bg-deep-navy overflow-hidden">
        {/* Mobile Header */}
        <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-slate-blue border-b border-sky-cyan/20 flex items-center justify-between px-4 z-30">
          <div className="flex items-center gap-2">
            <Bot size={24} className="text-electric-blue" />
            <span className="font-bold text-off-white">FLUENTO</span>
          </div>
          <button 
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 text-gray-400 hover:text-white"
          >
            <Menu size={24} />
          </button>
        </div>

        <Sidebar 
          user={currentUser}
          onSignOut={handleSignOut}
          activePage={activePage}
          setActivePage={setActivePage}
          selectedLanguage={selectedLanguage}
          setSelectedLanguage={setSelectedLanguage}
          selectedMode={selectedMode}
          setSelectedMode={setSelectedMode}
          isOpen={isSidebarOpen}
          onClose={() => setIsSidebarOpen(false)}
        />
        <div className="flex-1 flex flex-col pt-16 lg:pt-0 overflow-hidden">
          {renderActivePage()}
        </div>
      </div>
    </LanguageProvider>
  );
};

export default App;