"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.postChat = postChat;
exports.getChatHistory = getChatHistory;
exports.deleteChatHistory = deleteChatHistory;
const crypto_1 = __importDefault(require("crypto"));
const index_1 = require("../index");
const gemini_service_1 = require("../services/gemini.service");
/**
 * POST /api/ai/chat
 * Accepts { conversationId, message } in the body.
 * Feeds history (up to 10 messages) + current message to Gemini 1.5 Flash.
 * Performs direct search in listings database if listings queries are detected.
 * Returns streaming SSE chunks if requested, otherwise full JSON.
 */
async function postChat(req, res) {
    try {
        const { message } = req.body;
        let conversationId = req.body.conversationId;
        if (!message || typeof message !== "string") {
            res.status(400).json({ message: "Message must be a non-empty string" });
            return;
        }
        // Generate a UUID if conversationId is not provided
        if (!conversationId) {
            conversationId = crypto_1.default.randomUUID();
        }
        const db = await (0, index_1.connectToDatabase)();
        // 1. Fetch the last 10 messages for this conversationId & userId (to prevent cross-user leakage)
        const history = await db.collection("chat_messages")
            .find({ userId: req.userId, conversationId })
            .sort({ createdAt: -1 })
            .limit(10)
            .toArray();
        // Reverse history to keep it chronological: oldest to newest
        history.reverse();
        // 2. Build system instructions
        const systemInstruction = "You are the NextMatch assistant, a helpful guide for a property rental platform. You help users find apartments, understand how listings/filters/AI recommendations work, and navigate the site (Explore page, Add Listing, Manage Listings, Profile). Keep answers concise and friendly.";
        // 3. Detect if asking about actual listings
        const isAskingAboutListings = /price|rent|apartment|room|flat|house|bedroom|bathroom|show me|find|search|near/i.test(message);
        // Fetch distinct cities from database to check for matching city names in the query
        const distinctCities = await db.collection("listings").distinct("location.city");
        const cityInMessage = distinctCities.find(city => new RegExp(`\\b${city}\\b`, "i").test(message));
        let decoratedMessage = message;
        let matchingListings = [];
        if (isAskingAboutListings || cityInMessage) {
            // Build listings query
            const listingQuery = { status: "active" };
            if (cityInMessage) {
                listingQuery["location.city"] = { $regex: `^${cityInMessage}$`, $options: "i" };
            }
            // Check for price number
            const priceMatch = message.match(/\b\d{3,5}\b/);
            if (priceMatch) {
                const price = parseInt(priceMatch[0], 10);
                const lowerMsg = message.toLowerCase();
                if (lowerMsg.includes("under") ||
                    lowerMsg.includes("below") ||
                    lowerMsg.includes("max") ||
                    lowerMsg.includes("less than") ||
                    lowerMsg.includes("budget")) {
                    listingQuery.price = { $lte: price };
                }
                else if (lowerMsg.includes("above") ||
                    lowerMsg.includes("over") ||
                    lowerMsg.includes("min") ||
                    lowerMsg.includes("more than")) {
                    listingQuery.price = { $gte: price };
                }
                else {
                    listingQuery.price = { $lte: price * 1.2 };
                }
            }
            // Check for bedroom counts
            const bedroomMatch = message.match(/(\d+)\s*(?:bedroom|bhk|bed)/i);
            if (bedroomMatch) {
                listingQuery.bedrooms = parseInt(bedroomMatch[1], 10);
            }
            // Query DB for up to 5 listings
            matchingListings = await db.collection("listings")
                .find(listingQuery)
                .limit(5)
                .toArray();
            if (matchingListings.length > 0) {
                const listingsSummary = matchingListings.map(l => ({
                    id: l._id.toString(),
                    title: l.title,
                    price: l.price,
                    city: l.location.city,
                    bedrooms: l.bedrooms,
                    bathrooms: l.bathrooms,
                    sizeSqft: l.sizeSqft,
                    shortDescription: l.shortDescription
                }));
                decoratedMessage = `[System Context: Here are up to 5 matching listings from the database for the user's query. Use this real data to answer the user's question. Do not make up listing prices, cities, or details outside this list. If the list is empty or doesn't match well, tell the user what's available and ask for clarification:
${JSON.stringify(listingsSummary, null, 2)}
]

User query: ${message}`;
            }
        }
        // 4. Check if stream is requested
        const shouldStream = req.headers.accept === "text/event-stream" || req.body.stream === true;
        // Convert history messages to expected param format
        const historyParams = history.map(m => ({
            role: m.role,
            content: m.content
        }));
        if (shouldStream) {
            res.setHeader("Content-Type", "text/event-stream");
            res.setHeader("Cache-Control", "no-cache");
            res.setHeader("Connection", "keep-alive");
            let assistantReply = "";
            try {
                assistantReply = await (0, gemini_service_1.generateResponse)(systemInstruction, historyParams, decoratedMessage, (chunkText) => {
                    res.write(`data: ${JSON.stringify({ chunk: chunkText })}\n\n`);
                });
                // Save messages in DB
                const now = new Date();
                const userMsg = {
                    userId: req.userId,
                    conversationId,
                    role: "user",
                    content: message, // Save original message, not decorated message
                    createdAt: now,
                    updatedAt: now
                };
                const assistantMsg = {
                    userId: req.userId,
                    conversationId,
                    role: "assistant",
                    content: assistantReply,
                    createdAt: now,
                    updatedAt: now
                };
                await db.collection("chat_messages").insertMany([userMsg, assistantMsg]);
                // Generate suggested follow-up questions
                const updatedHistory = [
                    ...historyParams,
                    { role: "user", content: message }
                ];
                const suggestedFollowUps = await (0, gemini_service_1.generateFollowUpQuestions)(updatedHistory, assistantReply);
                res.write(`data: ${JSON.stringify({
                    done: true,
                    success: true,
                    reply: assistantReply,
                    suggestedFollowUps,
                    conversationId
                })}\n\n`);
                res.end();
            }
            catch (err) {
                console.error("Streaming error:", err);
                res.write(`data: ${JSON.stringify({ error: "Failed to generate assistant response" })}\n\n`);
                res.end();
            }
        }
        else {
            try {
                const assistantReply = await (0, gemini_service_1.generateResponse)(systemInstruction, historyParams, decoratedMessage);
                // Save messages in DB
                const now = new Date();
                const userMsg = {
                    userId: req.userId,
                    conversationId,
                    role: "user",
                    content: message,
                    createdAt: now,
                    updatedAt: now
                };
                const assistantMsg = {
                    userId: req.userId,
                    conversationId,
                    role: "assistant",
                    content: assistantReply,
                    createdAt: now,
                    updatedAt: now
                };
                await db.collection("chat_messages").insertMany([userMsg, assistantMsg]);
                // Generate suggested follow-up questions
                const updatedHistory = [
                    ...historyParams,
                    { role: "user", content: message }
                ];
                const suggestedFollowUps = await (0, gemini_service_1.generateFollowUpQuestions)(updatedHistory, assistantReply);
                res.json({
                    success: true,
                    reply: assistantReply,
                    suggestedFollowUps,
                    conversationId
                });
            }
            catch (err) {
                console.error("Non-stream error:", err);
                res.status(500).json({ message: "Failed to generate assistant response" });
            }
        }
    }
    catch (err) {
        console.error("postChat controller error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}
/**
 * GET /api/ai/chat/:conversationId
 * Returns the full message history for a conversation, ordered oldest to newest.
 */
async function getChatHistory(req, res) {
    try {
        const { conversationId } = req.params;
        const db = await (0, index_1.connectToDatabase)();
        const history = await db.collection("chat_messages")
            .find({ userId: req.userId, conversationId })
            .sort({ createdAt: 1 })
            .toArray();
        res.json({
            success: true,
            history
        });
    }
    catch (err) {
        console.error("getChatHistory error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}
/**
 * DELETE /api/ai/chat/:conversationId
 * Deletes all messages for a conversation.
 */
async function deleteChatHistory(req, res) {
    try {
        const { conversationId } = req.params;
        const db = await (0, index_1.connectToDatabase)();
        const result = await db.collection("chat_messages")
            .deleteMany({ userId: req.userId, conversationId });
        res.json({
            success: true,
            deletedCount: result.deletedCount
        });
    }
    catch (err) {
        console.error("deleteChatHistory error:", err);
        res.status(500).json({ message: "Internal server error" });
    }
}
