import React, { useState, useEffect } from 'react';
import { MessageCircle, BookText, GraduationCap, BarChart2 } from 'lucide-react';
import { getProgress } from '../utils/progress';
import { type User, type ProgressData } from '../types';

interface ProgressPageProps {
  user: User;
}

const StatCard: React.FC<{ icon: React.ElementType, title: string, value: string | number, label: string, color: string }> = 
({ icon: Icon, title, value, label, color }) => (
    <div className="bg-slate-blue border border-sky-cyan/20 rounded-xl p-6 shadow-lg flex items-center gap-6">
        <div className={`p-4 rounded-full ${color}`}>
            <Icon className="w-8 h-8 text-deep-navy" />
        </div>
        <div>
            <p className="text-sm text-gray-400 font-medium">{title}</p>
            <p className="text-3xl font-bold text-off-white">{value}</p>
            <p className="text-sm text-gray-400">{label}</p>
        </div>
    </div>
);

const ProgressPage: React.FC<ProgressPageProps> = ({ user }) => {
  const [progress, setProgress] = useState<ProgressData | null>(null);

  useEffect(() => {
    const data = getProgress(user.email);
    setProgress(data);
  }, [user.email]);

  if (!progress) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-t-transparent border-electric-blue rounded-full animate-spin"></div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col h-full overflow-y-auto bg-deep-navy">
      <header className="p-4 border-b border-sky-cyan/20 sticky top-0 bg-slate-blue/80 backdrop-blur-sm z-10">
        <h1 className="text-xl font-bold text-electric-blue">Your Progress</h1>
        <p className="text-sm text-gray-400">Track your language learning journey and celebrate your milestones.</p>
      </header>

      <main className="flex-1 p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-fade-in-up">
            <StatCard 
                icon={MessageCircle}
                title="Conversation"
                value={progress.conversation.sessions}
                label="Sessions Completed"
                color="bg-electric-blue"
            />
             <StatCard 
                icon={BarChart2}
                title="Grammar"
                value={progress.conversation.totalCorrections}
                label="Corrections Received"
                color="bg-yellow-400"
            />
            <StatCard 
                icon={BookText}
                title="Vocabulary"
                value={progress.vocabulary.sessions}
                label="Daily Sets Learned"
                color="bg-aqua-green"
            />
            <StatCard 
                icon={GraduationCap}
                title="Accent Coach"
                value={progress.accentCoach.sentencesPracticed}
                label="Sentences Practiced"
                color="bg-sky-cyan"
            />
            <StatCard 
                icon={GraduationCap}
                title="Avg. Accent Score"
                value={`${progress.accentCoach.averageScore}`}
                label="Out of 100"
                color="bg-crimson-red"
            />
        </div>

        <div className="mt-8 bg-slate-blue border border-sky-cyan/20 rounded-xl p-6 shadow-lg animate-fade-in-up" style={{animationDelay: '100ms'}}>
            <h2 className="text-lg font-semibold text-off-white mb-4">Keep Going!</h2>
            <p className="text-gray-400">
                Consistency is key to learning a new language. You're doing a great job building a habit. Try to complete a session in each category every day to see the fastest improvement.
            </p>
        </div>
      </main>
    </div>
  );
};

export default ProgressPage;