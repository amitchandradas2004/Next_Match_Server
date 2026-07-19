import { ObjectId } from "mongodb";

export interface ChatMessage {
  _id?: ObjectId;
  userId: ObjectId;
  conversationId: string;
  role: "user" | "assistant";
  content: string;
  createdAt: Date;
  updatedAt: Date;
}
