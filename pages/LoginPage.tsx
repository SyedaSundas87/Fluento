import React, { useState } from 'react';
import { Bot, LogIn } from 'lucide-react';
import { signIn } from '../utils/auth';
import { type User } from '../types';

interface LoginPageProps {
  onLogin: (user: User) => void;
  onSwitchToSignup: () => void;
}

const LoginPage: React.FC<LoginPageProps> = ({ onLogin, onSwitchToSignup }) => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setIsLoading(true);

    try {
      const trimmedEmail = email.trim().toLowerCase();
      const trimmedPassword = password.trim();

      if (!trimmedEmail || !trimmedPassword) {
        throw new Error('Please enter both email and password.');
      }

      const user = signIn(trimmedEmail, trimmedPassword);
      onLogin(user);
    } catch (err: any) {
      setError(err.message || 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-deep-navy p-4">
      <div className="w-full max-w-md">
        <div className="flex justify-center mb-6">
          <div className="p-3 bg-electric-blue rounded-2xl shadow-lg">
            <Bot className="w-10 h-10 text-deep-navy" />
          </div>
        </div>
        <div className="bg-slate-blue p-8 rounded-2xl shadow-2xl border border-sky-cyan/20">
          <h1 className="text-3xl font-bold text-center text-off-white mb-2">Welcome to FLUENTO</h1>
          <p className="text-center text-gray-400 mb-8">Sign in to continue your learning journey.</p>
          
          {error && <div className="mb-4 p-3 bg-crimson-red/20 border border-crimson-red/50 rounded-lg text-crimson-red text-sm">{error}</div>}
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-gray-400">Email Address</label>
              <input
                id="email"
                name="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-1 block w-full px-4 py-3 bg-user-bubble border border-sky-cyan/30 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-electric-blue text-off-white"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-400">Password</label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-1 block w-full px-4 py-3 bg-user-bubble border border-sky-cyan/30 rounded-lg shadow-sm focus:outline-none focus:ring-2 focus:ring-electric-blue text-off-white"
              />
            </div>
            
            <button
              type="submit"
              disabled={isLoading}
              className="w-full flex justify-center items-center py-3 px-4 border border-transparent rounded-lg shadow-sm text-deep-navy font-bold bg-electric-blue/90 hover:bg-electric-blue focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-slate-blue focus:ring-electric-blue disabled:opacity-50"
            >
              {isLoading ? 'Signing In...' : 'Sign In'}
              <LogIn className="w-5 h-5 ml-2"/>
            </button>
          </form>
          
          <p className="mt-8 text-center text-sm text-gray-400">
            Don't have an account?{' '}
            <button onClick={onSwitchToSignup} className="font-medium text-sky-cyan hover:underline">
              Sign up
            </button>
          </p>
        </div>
      </div>
    </div>
  );
};

export default LoginPage;