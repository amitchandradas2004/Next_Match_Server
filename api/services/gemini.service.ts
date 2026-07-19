import { GoogleGenAI } from "@google/genai";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("WARNING: GEMINI_API_KEY is not defined in the environment variables.");
}

const ai = new GoogleGenAI({ apiKey: apiKey || "" });

export interface ChatMessageParam {
  role: "user" | "assistant";
  content: string;
}

/**
 * Generates an assistant response, with support for streaming.
 * Maps custom roles ('assistant') to Gemini SDK roles ('model').
 */
export async function generateResponse(
  systemInstruction: string,
  history: ChatMessageParam[],
  message: string,
  streamCallback?: (chunkText: string) => void
): Promise<string> {
  const contents = [
    ...history.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];

  if (streamCallback) {
    const stream = await ai.models.generateContentStream({
      model: "gemini-3.5-flash",
      contents,
      config: { systemInstruction },
    });

    let fullText = "";
    for await (const chunk of stream) {
      const text = chunk.text ?? "";
      fullText += text;
      streamCallback(text);
    }
    return fullText;
  } else {
    const response = await ai.models.generateContent({
      model: "gemini-3.5-flash",
      contents,
      config: { systemInstruction },
    });
    return response.text ?? "";
  }
}

/**
 * Generates exactly 3 follow-up questions as a JSON array of strings.
 */
export async function generateFollowUpQuestions(
  history: ChatMessageParam[],
  lastReply: string
): Promise<string[]> {
  const followUpPrompt = `Based on the conversation history and the assistant's last reply, generate exactly 3 short suggested follow-up questions that the user might want to ask next. Keep them highly relevant, action-oriented, and short.
Return them as a JSON array of strings. Do not include any other text, markdown formatting, or explanations.`;

  const contents = [
    ...history.map((msg) => ({
      role: msg.role === "assistant" ? "model" : "user",
      parts: [{ text: msg.content }],
    })),
    { role: "model", parts: [{ text: lastReply }] },
    { role: "user", parts: [{ text: followUpPrompt }] },
  ];

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-lite",
      contents,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "ARRAY",
          items: { type: "STRING" },
        },
      },
    });

    const questions = JSON.parse(response.text ?? "[]");
    if (Array.isArray(questions)) {
      return questions.slice(0, 3);
    }
  } catch (err) {
    console.error("Failed to generate suggested follow-up questions from Gemini:", err);
  }

  return [
    "What listings are currently available in my budget?",
    "How can I filter apartments by amenities?",
    "Can you help me contact a property lister?",
  ];
}