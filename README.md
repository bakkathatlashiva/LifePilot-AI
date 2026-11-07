# LifePilot AI — Intelligent Personal Assistant

> Never miss a deadline again. LifePilot AI monitors your college ERP, analyzes emails with AI, and keeps you ahead of every academic responsibility.

---

## Architecture Overview

```
lifepilot-ai/
├── backend/          Node.js + Express + TypeScript + Prisma
├── web/              React + Vite + TypeScript + Tailwind CSS
└── mobile/           React Native + Expo + TypeScript
```

All three share the same PostgreSQL database through the backend REST API.

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | ≥ 20.x | Backend + Web |
| PostgreSQL | ≥ 15 | Primary database |
| Redis | ≥ 7 | BullMQ job queues |
| Expo CLI | latest | Mobile builds |
| EAS CLI | latest | APK/AAB builds |

---

## Quick Start

### 1. Clone and install dependencies

```bash
git clone <repo-url>
cd lifepilot-ai

# Install backend
cd backend && npm install

# Install web
cd ../web && npm install

# Install mobile
cd ../mobile && npm install
```

### 2. Configure backend environment

```bash
cd backend
cp ../.env.example .env
# Edit .env with your values (see Environment Variables section)
```

### 3. Set up PostgreSQL

```bash
# Create database
createdb lifepilot_db

# Run migrations
cd backend
npx prisma migrate dev --name init

# Generate Prisma client
npx prisma generate
```

### 4. Start Redis (required for background jobs)

```bash
# Windows (WSL or Redis on Windows)
redis-server

# Or use Upstash cloud Redis (set REDIS_URL in .env)
```

### 5. Start the backend

```bash
cd backend
npm run dev
# Backend runs at http://localhost:3001
```

### 6. Start the web frontend

```bash
cd web
cp .env.example .env
npm run dev
# Web runs at http://localhost:5173
```

### 7. Start the Android app

```bash
cd mobile
cp .env.example .env
# Edit .env with your backend URL

npm start
# Press 'a' for Android emulator, or scan QR code with Expo Go
```

---

## Environment Variables

See `.env.example` for the full list. Key required variables:

| Variable | Description |
|----------|-------------|
| `DATABASE_URL` | PostgreSQL connection string |
| `JWT_SECRET` | JWT signing secret (min 64 chars) |
| `JWT_REFRESH_SECRET` | Refresh token secret |
| `GOOGLE_CLIENT_ID` | Google OAuth 2.0 client ID |
| `GOOGLE_CLIENT_SECRET` | Google OAuth 2.0 secret |
| `OPENAI_API_KEY` | OpenAI API key for AI features |
| `REDIS_URL` | Redis connection URL |
| `ENCRYPTION_KEY` | 32-byte hex key for token encryption |

Optional (for full functionality):
- `TWILIO_*` — Phone call reminders
- `VAPID_*` — Web push notifications
- `FIREBASE_*` — Android FCM push notifications

---

## Google OAuth Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select existing
3. Enable APIs: **Google+ API**, **Gmail API**, **Google OAuth2 API**
4. Create OAuth 2.0 credentials (Web application)
5. Add authorized redirect URIs:
   - `http://localhost:3001/api/auth/google/callback` (development)
   - `https://your-backend.render.com/api/auth/google/callback` (production)
6. Copy Client ID and Secret to `.env`

---

## Aurora ERP Integration

The ERP integration uses authorized Playwright browser automation:

1. User opens Settings → ERP Connection in the app
2. User logs into Aurora ERP manually using their Google account in a browser
3. User copies session cookies from browser DevTools (F12 → Application → Cookies)
4. User pastes cookies JSON into the LifePilot app
5. LifePilot encrypts and stores the session, then monitors every 30 minutes

**Limitations:**
- Session cookies expire after ~12–24 hours and need to be refreshed
- If Aurora ERP blocks headless browsers or enforces CAPTCHA, automated access will not work
- This module never bypasses MFA, CAPTCHA, or access restrictions
- If Aurora provides an official API in the future, it will be used instead

---

## Database Migrations

```bash
cd backend

# Create a new migration
npx prisma migrate dev --name describe_your_change

# Deploy to production
npx prisma migrate deploy

# Open Prisma Studio (visual DB browser)
npx prisma studio

# Reset database (DESTRUCTIVE — development only)
npx prisma migrate reset
```

---

## Deployment

### Backend → Render

1. Create a new Web Service on [Render](https://render.com)
2. Connect your GitHub repository
3. Set build command: `cd backend && npm install && npx prisma migrate deploy && npm run build`
4. Set start command: `cd backend && npm start`
5. Add all environment variables from `.env.example`
6. Add a managed PostgreSQL database (Render or Neon)

### Web → Vercel

1. Import project at [Vercel](https://vercel.com)
2. Set root directory to `web`
3. Set environment variable: `VITE_API_URL=https://your-backend.render.com/api`
4. Deploy

### Android APK → EAS Build

```bash
cd mobile
npm install -g eas-cli
eas login
eas init
eas build --platform android --profile preview  # generates APK
eas build --platform android --profile production  # generates AAB for Play Store
```

---

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/auth/google` | Start Google OAuth |
| `GET` | `/api/auth/google/callback` | OAuth callback |
| `POST` | `/api/auth/refresh` | Refresh access token |
| `GET` | `/api/auth/profile` | Get user profile |
| `GET` | `/api/tasks` | List tasks (paginated, filterable) |
| `POST` | `/api/tasks` | Create task |
| `PUT` | `/api/tasks/:id` | Update task |
| `DELETE` | `/api/tasks/:id` | Delete task |
| `GET` | `/api/tasks/stats` | Dashboard statistics |
| `GET` | `/api/erp/status` | ERP connection status |
| `POST` | `/api/erp/session` | Save ERP session cookies |
| `POST` | `/api/erp/sync` | Trigger manual ERP sync |
| `GET` | `/api/erp/assignments` | List ERP assignments |
| `GET` | `/api/gmail/status` | Gmail sync status |
| `POST` | `/api/gmail/sync` | Trigger Gmail sync |
| `GET` | `/api/gmail/emails` | List analyzed emails |
| `GET` | `/api/gmail/suggestions` | Pending task suggestions |
| `POST` | `/api/gmail/suggestions/:id/approve` | Approve suggestion → create task |
| `POST` | `/api/gmail/suggestions/:id/reject` | Reject suggestion |
| `POST` | `/api/ai/chat` | AI assistant chat |
| `GET` | `/api/ai/briefing/:type` | Daily briefing (morning/evening) |
| `POST` | `/api/ai/parse-task` | Parse natural language task |
| `GET` | `/api/notifications` | List notifications |
| `PUT` | `/api/notifications/:id/read` | Mark notification read |
| `POST` | `/api/notifications/fcm-token` | Register FCM token |
| `GET` | `/api/exams` | List exams |
| `POST` | `/api/exams` | Create exam |
| `GET` | `/api/exams/subjects` | List subjects |
| `GET` | `/api/exams/study-sessions` | List study sessions |
| `GET` | `/api/preferences` | Get user preferences |
| `PUT` | `/api/preferences` | Update preferences |

---

## Security Notes

- All session tokens (ERP cookies, OAuth tokens) are encrypted with AES-256-GCM before storage
- JWT access tokens expire in 15 minutes; refresh tokens in 7 days
- Rate limiting is applied to all endpoints (20 auth requests / 15 min; 30 AI requests / min)
- Minimal Gmail scopes: `gmail.readonly` and `gmail.labels` only
- Input validation with Zod on all API endpoints
- CORS restricted to known frontend origins
- User data is fully isolated by `userId` foreign keys

---

## License

MIT
