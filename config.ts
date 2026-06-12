import { Language, Mode } from './types';

export const LANGUAGES: Language[] = [
  { name: 'English', code: 'en-US', flag: '🇬🇧', voice: 'Zephyr' },
  { name: 'Spanish', code: 'es-ES', flag: '🇪🇸', voice: 'Puck' },
  { name: 'French', code: 'fr-FR', flag: '🇫🇷', voice: 'Charon' },
  { name: 'German', code: 'de-DE', flag: '🇩🇪', voice: 'Charon' },
  { name: 'Korean', code: 'ko-KR', flag: '🇰🇷', voice: 'Kore' },
  { name: 'Japanese', code: 'ja-JP', flag: '🇯🇵', voice: 'Kore' },
  { name: 'Chinese', code: 'zh-CN', flag: '🇨🇳', voice: 'Puck' },
  { name: 'Arabic', code: 'ar-SA', flag: '🇸🇦', voice: 'Fenrir' },
  { name: 'Urdu', code: 'ur-PK', flag: '🇵🇰', voice: 'Zephyr' },
];

export const MODES: Mode[] = [
  { id: 'casual', name: 'Casual Chat' },
  { id: 'interview', name: 'Interview Practice' },
  { id: 'travel', name: 'Travel Talk' },
  { id: 'exam', name: 'Exam Prep' },
];
