# Next Match Server

A robust, high-performance Node.js backend for the **Next Match** apartment matching platform. Built with Express.js, TypeScript, and MongoDB, the server features session-based authentication and intelligent property search powered by Google's Gemini AI.

---

## 🚀 Key Features

- **AI-Powered Property Search**: Integrates with the Gemini API (`@google/genai`) to parse natural language queries, extract user preferences (such as price ranges, bedroom counts, and locations), and query active database listings.
- **Robust Authentication**: Implements cookie and authorization header parsing to securely validate sessions via **Better Auth** against stored database sessions and users.
- **MongoDB Connection Caching**: Optimized for serverless environments (like Vercel) by caching the database connection across warm invocations.
- **Compound Indexes**: Optimizes chat messages collection query performance using compound indices (`{ userId: 1, conversationId: 1, createdAt: 1 }`).
- **Serverless Ready**: Out-of-the-box configuration for deploying seamlessly as Vercel serverless functions.

---

## 📁 Directory Structure

```text
next_match_server/
├── api/
│   ├── index.ts                 # Server entry point & DB connection caching
│   ├── controllers/
│   │   └── aiChatController.ts  # Handlers for chatbot queries & message history
│   ├── middleware/
│   │   └── auth.ts              # Protects routes by validating Better Auth session tokens
│   ├── models/
│   │   └── ChatMessage.ts       # Message schema and types
│   ├── routes/
│   │   └── aiChatRoutes.ts      # Router for protected chatbot API endpoints
│   ├── services/
│   │   └── gemini.service.ts    # Gemini API wrapper for completions and analysis
│   └── verify-implementation.ts # Test script for validating core db query behavior
├── package.json                 # Project dependencies & scripts
├── tsconfig.json                # TypeScript compiler configuration
└── vercel.json                  # Vercel deployment routing configuration
```

---

## 📡 API Endpoints

### Public Endpoints

- **`GET /`** - Welcome message
- **`GET /api/health`** - Basic server health check

### Listing Endpoints

- **`POST /api/listings`** - Registers a new apartment listing

### Protected Endpoints (`/api/ai/chat/*`)
*Requires a valid `better-auth.session_token` cookie or `Authorization: Bearer <token>` header.*

- **`POST /api/ai/chat`** - Sends a new message to the Gemini AI chat, automatically retrieving matching listings if searching for apartments.
- **`GET /api/ai/chat/:conversationId`** - Retrieves chat message history for the given conversation.
- **`DELETE /api/ai/chat/:conversationId`** - Clears/deletes chat message history for the given conversation.

---

## ⚙️ Configuration & Environment

Create a `.env` file in the root of the server directory using the schema below:

```ini
PORT=5000
MONGODB_URI=mongodb://your_mongodb_connection_uri
DB_NAME=nextmatch
GEMINI_API_KEY=your_google_gemini_api_key
NEXT_PUBLIC_CLIENT_URL=http://localhost:3000
```

---

## 🛠️ Development & Commands

### Install Dependencies
```bash
npm install
```

### Start Development Server
Runs the API server in watch mode using `tsx`:
```bash
npm run dev
```

### Build for Production
Compiles TS code into the `dist` directory:
```bash
npm run build
```

### Start Production Server
Runs the compiled JS code:
```bash
npm run start
```
