import "dotenv/config"; // MUST be the very first import — runs before anything else

import cors from "cors";
import express, { Request, Response, NextFunction } from "express";
import { MongoClient, ServerApiVersion, ObjectId, Collection } from "mongodb";
import aiChatRoutes from "./routes/aiChatRoutes";

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors({ origin: process.env.NEXT_PUBLIC_CLIENT_URL, credentials: true }));
app.use(express.json());

const uri = process.env.MONGODB_URI as string;

// --- Connection caching for serverless ---
let client: MongoClient | null = null;
let db: ReturnType<MongoClient["db"]> | null = null;

export async function connectToDatabase() {
  if (db) {
    return db; // reuse existing connection on warm invocations
  }

  client = new MongoClient(uri, {
    serverApi: {
      version: ServerApiVersion.v1,
      strict: true,
      deprecationErrors: true,
    },
  });

  await client.connect();
  console.log("Connected to MongoDB");

  db = client.db(process.env.DB_NAME as string);

  // Ensure compound index for fast history retrieval
  await db.collection("chat_messages").createIndex({ userId: 1, conversationId: 1, createdAt: 1 });

  return db;
}

// Ensure DB is connected before any route handler runs
app.use(async (req: Request, res: Response, next: NextFunction) => {
  try {
    await connectToDatabase();
    next();
  } catch (err) {
    console.error("DB connection error:", err);
    res.status(500).json({ message: "Database connection failed" });
  }
});

app.get("/api/health", (req: Request, res: Response) => {
  res.send("OK");
});
//post aparments api is here
app.post('/api/listings', async (req: Request, res: Response) => {
  const db = await connectToDatabase();
  const listings = db.collection("listings");
  const listing = await listings.insertOne(req.body);
  res.json(listing);
})
// Register AI Chat routes
app.use("/api/ai/chat", aiChatRoutes);

app.get("/", (req: Request, res: Response) => {
  res.send("Welcome to the Next Match API!");
});


// Only listen locally — Vercel handles invocation itself for serverless
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

export default app;