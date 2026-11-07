import dotenv from 'dotenv';
dotenv.config();

function requireEnv(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing required environment variable: ${key}`);
  return val;
}

function optional(key: string, fallback = ''): string {
  return process.env[key] ?? fallback;
}

export const env = {
  // Server
  NODE_ENV: optional('NODE_ENV', 'development'),
  PORT: parseInt(optional('PORT', '3001')),
  FRONTEND_URL: optional('FRONTEND_URL', 'http://localhost:5173'),
  API_BASE_URL: optional('API_BASE_URL', 'http://localhost:3001'),

  // Database
  DATABASE_URL: requireEnv('DATABASE_URL'),

  // Auth
  JWT_SECRET: requireEnv('JWT_SECRET'),
  JWT_REFRESH_SECRET: requireEnv('JWT_REFRESH_SECRET'),
  JWT_EXPIRES_IN: optional('JWT_EXPIRES_IN', '15m'),
  JWT_REFRESH_EXPIRES_IN: optional('JWT_REFRESH_EXPIRES_IN', '7d'),

  // Google OAuth
  GOOGLE_CLIENT_ID: requireEnv('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: requireEnv('GOOGLE_CLIENT_SECRET'),
  GOOGLE_REDIRECT_URI: optional('GOOGLE_REDIRECT_URI', 'https://lifepilot-ai-backend-uwp4.onrender.com/api/auth/google/callback'),
  GOOGLE_ANDROID_CLIENT_ID: optional('GOOGLE_ANDROID_CLIENT_ID', '262381768373-u9n98t1f3ct48jiaflaj17ek45fpjm1g.apps.googleusercontent.com'),

  // OpenAI
  OPENAI_API_KEY: optional('OPENAI_API_KEY', 'sk-placeholder'),
  OPENAI_MODEL: optional('OPENAI_MODEL', 'gpt-4o-mini'),

  // Valkey / In-Memory Store
  VALKEY_URL: optional('VALKEY_URL', process.env.REDIS_URL || 'redis://localhost:6379'),
  REDIS_URL: optional('REDIS_URL', process.env.VALKEY_URL || 'redis://localhost:6379'),

  // Twilio
  TWILIO_ACCOUNT_SID: optional('TWILIO_ACCOUNT_SID'),
  TWILIO_AUTH_TOKEN: optional('TWILIO_AUTH_TOKEN'),
  TWILIO_PHONE_NUMBER: optional('TWILIO_PHONE_NUMBER'),

  // Web Push (VAPID)
  VAPID_PUBLIC_KEY: optional('VAPID_PUBLIC_KEY'),
  VAPID_PRIVATE_KEY: optional('VAPID_PRIVATE_KEY'),
  VAPID_EMAIL: optional('VAPID_EMAIL', 'admin@lifepilot.ai'),

  // Firebase / FCM
  FIREBASE_PROJECT_ID: optional('FIREBASE_PROJECT_ID'),
  FIREBASE_CLIENT_EMAIL: optional('FIREBASE_CLIENT_EMAIL'),
  FIREBASE_PRIVATE_KEY: optional('FIREBASE_PRIVATE_KEY'),

  // Encryption
  ENCRYPTION_KEY: requireEnv('ENCRYPTION_KEY'), // 32-char hex string

  // Aurora ERP
  AURORA_ERP_URL: optional('AURORA_ERP_URL', 'https://admissions.aurora.edu.in/modules/assessments/assessments'),
  AURORA_ERP_USER: optional('AURORA_ERP_USER', ''),
  AURORA_ERP_PASSWORD: optional('AURORA_ERP_PASSWORD', ''),
  // Telegram integration (optional)
  TELEGRAM_BOT_TOKEN: optional('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_BOT_USERNAME: optional('TELEGRAM_BOT_USERNAME'),
  TELEGRAM_WEBHOOK_SECRET: optional('TELEGRAM_WEBHOOK_SECRET'),
} as const;
