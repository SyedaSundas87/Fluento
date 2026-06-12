
export interface LanguageConfig {
  name: string;
  nativeName: string;        // e.g. "اردو" for Urdu
  rtl: boolean;              // right to left text direction
  flag: string;              // Emoji flag
  speechCode: string;        // Web Speech API language code
  speechSupported: boolean;  // is Web Speech reliable for this language
  fontClass: string;         // Tailwind font class if needed
}

export const LANGUAGE_CONFIG: Record<string, LanguageConfig> = {
  English:  { name: 'English', nativeName: 'English', rtl: false, flag: '🇺🇸', speechCode: 'en-US', speechSupported: true,  fontClass: '' },
  Urdu:     { name: 'Urdu',    nativeName: 'اردو',    rtl: true,  flag: '🇵🇰', speechCode: 'ur-PK', speechSupported: false, fontClass: 'font-urdu' },
  Arabic:   { name: 'Arabic',  nativeName: 'العربية', rtl: true,  flag: '🇸🇦', speechCode: 'ar-SA', speechSupported: false, fontClass: '' },
  French:   { name: 'French',  nativeName: 'Français',rtl: false, flag: '🇫🇷', speechCode: 'fr-FR', speechSupported: true,  fontClass: '' },
  Spanish:  { name: 'Spanish', nativeName: 'Español', rtl: false, flag: '🇪🇸', speechCode: 'es-ES', speechSupported: true,  fontClass: '' },
  German:   { name: 'German',  nativeName: 'Deutsch', rtl: false, flag: '🇩🇪', speechCode: 'de-DE', speechSupported: true,  fontClass: '' },
  Turkish:  { name: 'Turkish', nativeName: 'Türkçe',  rtl: false, flag: '🇹🇷', speechCode: 'tr-TR', speechSupported: true,  fontClass: '' },
  Chinese:  { name: 'Chinese', nativeName: '中文',    rtl: false, flag: '🇨🇳', speechCode: 'zh-CN', speechSupported: false, fontClass: '' },
  Hindi:    { name: 'Hindi',   nativeName: 'हिन्दी',  rtl: false, flag: '🇮🇳', speechCode: 'hi-IN', speechSupported: false, fontClass: '' },
};
