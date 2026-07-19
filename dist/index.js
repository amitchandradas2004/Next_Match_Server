"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectToDatabase = connectToDatabase;
const cors_1 = __importDefault(require("cors"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_1 = __importDefault(require("express"));
const mongodb_1 = require("mongodb");
const aiChatRoutes_1 = __importDefault(require("./routes/aiChatRoutes"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 5000;
app.use((0, cors_1.default)());
app.use(express_1.default.json());
const uri = process.env.MONGODB_URI;
// --- Connection caching for serverless ---
let client = null;
let db = null;
async function connectToDatabase() {
    if (db) {
        return db; // reuse existing connection on warm invocations
    }
    client = new mongodb_1.MongoClient(uri, {
        serverApi: {
            version: mongodb_1.ServerApiVersion.v1,
            strict: true,
            deprecationErrors: true,
        },
    });
    await client.connect();
    // console.log("Connected to MongoDB");
    db = client.db(process.env.DB_NAME);
    // Ensure compound index for fast history retrieval
    await db.collection("chat_messages").createIndex({ userId: 1, conversationId: 1, createdAt: 1 });
    return db;
}
// Ensure DB is connected before any route handler runs
app.use(async (req, res, next) => {
    try {
        await connectToDatabase();
        //post aparments api is here
        app.post('/api/listings', async (req, res) => {
            const db = await connectToDatabase();
            const listings = db.collection("listings");
            const listing = await listings.insertOne(req.body);
            res.json(listing);
        });
        next();
    }
    catch (err) {
        console.error("DB connection error:", err);
        res.status(500).json({ message: "Database connection failed" });
    }
});
// Register AI Chat routes
app.use("/api/ai/chat", aiChatRoutes_1.default);
app.get("/", (req, res) => {
    res.send("Welcome to the Next Match API!");
});
// Only listen locally — Vercel handles invocation itself for serverless
if (require.main === module) {
    app.listen(PORT, () => {
        // console.log(`Server running on port ${PORT}`);
    });
}
exports.default = app;
