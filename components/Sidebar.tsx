import React from 'react';
import { MessageCircle, BookText, Mic2, GraduationCap, Bot, TrendingUp, LogOut, Target, ClipboardCheck, Flame, Theater } from 'lucide-react';
import { LANGUAGES, MODES } from '../config';
import { Language, Mode, User } from '../types';
import { isChallengeCompletedToday } from '../utils/dailyChallenge';

type Page = 'conversation' | 'vocabulary' | 'translator' | 'accent' | 'progress' | 'assessment' | 'challenge' | 'vocabulary-quiz' | 'scene-practice';


interface NavItemProps {
    icon: React.ElementType;
    label: string;
    page: Page;
    activePage: Page;
    setActivePage: (page: Page) => void;
    hasIndicator?: boolean;
    indicatorColor?: string;
}

const NavItem: React.FC<NavItemProps> = ({ icon: Icon, label, page, activePage, setActivePage, hasIndicator, indicatorColor = 'bg-crimson-red' }) => {
    const isActive = activePage === page;
    
    return (
    <button
        onClick={() => setActivePage(page)}
        className={`flex items-center w-full p-3 my-1 rounded-lg transition-colors text-left relative ${
        isActive
            ? 'bg-electric-blue/10 text-electric-blue'
            : 'text-gray-400 hover:bg-slate-blue'
        }`}
    >
        <Icon className="w-6 h-6 mr-3 flex-shrink-0" />
        <span className="font-medium">{label}</span>
        {hasIndicator && (
          <div className={`absolute right-4 w-2 h-2 rounded-full ${indicatorColor} animate-pulse`} />
        )}
    </button>
    );
};

interface SidebarProps {
  user: User;
  onSignOut: () => void;
  activePage: Page;
  setActivePage: (page: Page) => void;
  selectedLanguage: Language;
  setSelectedLanguage: (language: Language) => void;
  selectedMode: Mode;
  setSelectedMode: (mode: Mode) => void;
  isOpen?: boolean;
  onClose?: () => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  user,
  onSignOut,
  activePage,
  setActivePage,
  selectedLanguage,
  setSelectedLanguage,
  selectedMode,
  setSelectedMode,
  isOpen,
  onClose
}) => {
  const isConversationActive = false; 

  const handleLanguageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const lang = LANGUAGES.find(l => l.code === e.target.value);
    if (lang) setSelectedLanguage(lang);
  };

  const handleModeChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const mode = MODES.find(m => m.id === e.target.value);
    if (mode) setSelectedMode(mode);
  };

  const handlePageSelect = (page: Page) => {
    setActivePage(page);
    if (onClose) onClose();
  };

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden"
          onClick={onClose}
        />
      )}

      <aside className={`fixed inset-y-0 left-0 w-72 bg-slate-blue border-r border-sky-cyan/20 flex flex-col p-4 z-50 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-electric-blue rounded-lg">
              <Bot className="w-7 h-7 text-deep-navy" />
            </div>
            <h1 className="text-xl font-bold text-off-white">
              FLUENTO
            </h1>
          </div>
          <button onClick={onClose} className="lg:hidden p-2 text-gray-400 hover:text-white">
             <Bot size={24} className="rotate-180" /> {/* Just a placeholder, using Bot as a close button helper or standard X */}
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto">
          <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">Features</h2>
          <NavItem 
            icon={Flame} 
            label="Daily Challenge" 
            page="challenge" 
            activePage={activePage} 
            setActivePage={handlePageSelect} 
            hasIndicator={!isChallengeCompletedToday(user.email)} 
          />
          <NavItem icon={MessageCircle} label="Conversation" page="conversation" activePage={activePage} setActivePage={handlePageSelect} />
          <NavItem icon={BookText} label="Vocabulary" page="vocabulary" activePage={activePage} setActivePage={handlePageSelect} />
          <NavItem icon={Theater} label="Scene Practice" page="scene-practice" activePage={activePage} setActivePage={handlePageSelect} />
          <NavItem icon={Mic2} label="Translator" page="translator" activePage={activePage} setActivePage={handlePageSelect} />
          <NavItem icon={Target} label="Accent Coach" page="accent" activePage={activePage} setActivePage={handlePageSelect} />
          <NavItem icon={GraduationCap} label="Assessment" page="assessment" activePage={activePage} setActivePage={handlePageSelect} />
          <NavItem icon={TrendingUp} label="Progress" page="progress" activePage={activePage} setActivePage={handlePageSelect} />
        </nav>

      <div>
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2 px-3">Settings</h2>
        <div className="space-y-3 mb-4">
            <div className="flex items-center gap-2 bg-deep-navy/70 p-2 rounded-lg border border-sky-cyan/20">
                <span className="text-2xl flex-shrink-0">{selectedLanguage.flag}</span>
                <select
                value={selectedLanguage.code}
                onChange={handleLanguageChange}
                disabled={isConversationActive}
                className="w-full bg-transparent text-off-white text-sm focus:outline-none disabled:opacity-50 appearance-none"
                aria-label="Select language"
                >
                {LANGUAGES.map(lang => (
                    <option key={lang.code} value={lang.code} className="bg-slate-blue text-off-white">
                    {lang.name}
                    </option>
                ))}
                </select>
            </div>

            <select
            value={selectedMode.id}
            onChange={handleModeChange}
            disabled={isConversationActive || activePage !== 'conversation'}
            className="w-full bg-deep-navy/70 p-2 rounded-lg text-off-white text-sm focus:outline-none disabled:opacity-50 disabled:text-gray-500 border border-sky-cyan/20 appearance-none"
            aria-label="Select conversation mode"
            >
            {MODES.map(mode => (
                <option key={mode.id} value={mode.id} className="bg-slate-blue text-off-white">{mode.name}</option>
            ))}
            </select>
        </div>

        <div className="border-t border-sky-cyan/20 pt-4">
            <div className="p-3 rounded-lg bg-deep-navy/70">
                <p className="text-sm font-semibold text-off-white truncate">{user.fullName}</p>
                <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
            <div className="flex items-center gap-2 mt-2">
                <button
                    onClick={onSignOut}
                    className="w-full p-2 rounded-lg flex items-center justify-center hover:bg-crimson-red/20 text-crimson-red transition-colors"
                    aria-label="Sign Out"
                >
                   <LogOut className="w-5 h-5 mr-2"/>
                   <span className="font-medium">Sign Out</span>
                </button>
            </div>
        </div>
      </div>
    </aside>
    </>
  );
};

export default Sidebar;