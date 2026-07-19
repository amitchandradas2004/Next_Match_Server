import { Router } from "express";
import { protect } from "../middleware/auth";
import { postChat, getChatHistory, deleteChatHistory } from "../controllers/aiChatController";

const router = Router();

// Protect all routes in this router
router.use(protect);

router.post("/", postChat);
router.get("/:conversationId", getChatHistory);
router.delete("/:conversationId", deleteChatHistory);

export default router;
