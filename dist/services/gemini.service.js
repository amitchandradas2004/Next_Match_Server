"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.generateResponse = generateResponse;
exports.generateFollowUpQuestions = generateFollowUpQuestions;
const generative_ai_1 = require("@google/generative-ai");
const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
    console.warn("WARNING: GEMINI_API_KEY is not defined in the environment variables.");
}
const genAI = new generative_ai_1.GoogleGenerativeAI(apiKey || "");
/**
 * Generates an assistant response, with support for streaming.
 * Maps custom roles ('assistant') to Gemini SDK roles ('model').
 */
async function generateResponse(systemInstruction, history, message, streamCallback) {
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
        systemInstruction: systemInstruction,
    });
    const chatHistory = history.map(msg => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: msg.content }]
    }));
    const chat = model.startChat({
        history: chatHistory,
    });
    if (streamCallback) {
        const result = await chat.sendMessageStream(message);
        let fullText = "";
        for await (const chunk of result.stream) {
            const text = chunk.text();
            fullText += text;
            streamCallback(text);
        }
        return fullText;
    }
    else {
        const result = await chat.sendMessage(message);
        return result.response.text();
    }
}
/**
 * Generates exactly 3 follow-up questions as a JSON array of strings.
 * Uses structured JSON schema output mode.
 */
async function generateFollowUpQuestions(history, lastReply) {
    const model = genAI.getGenerativeModel({
        model: "gemini-1.5-flash",
    });
    const followUpPrompt = `Based on the conversation history and the assistant's last reply, generate exactly 3 short suggested follow-up questions that the user might want to ask next. Keep them highly relevant, action-oriented, and short.
Return them as a JSON array of strings. Do not include any other text, markdown formatting, or explanations.`;
    // Construct context contents
    const contents = [
        ...history.map(msg => ({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
        })),
        { role: "model", parts: [{ text: lastReply }] },
        { role: "user", parts: [{ text: followUpPrompt }] }
    ];
    try {
        const result = await model.generateContent({
            contents: contents,
            generationConfig: {
                responseMimeType: "application/json",
                responseSchema: {
                    type: generative_ai_1.SchemaType.ARRAY,
                    items: {
                        type: generative_ai_1.SchemaType.STRING,
                    },
                },
            },
        });
        const responseText = result.response.text();
        const questions = JSON.parse(responseText);
        if (Array.isArray(questions)) {
            return questions.slice(0, 3);
        }
    }
    catch (err) {
        console.error("Failed to generate suggested follow-up questions from Gemini:", err);
    }
    // Fallback default suggestions
    return [
        "What listings are currently available in my budget?",
        "How can I filter apartments by amenities?",
        "Can you help me contact a property lister?"
    ];
}
