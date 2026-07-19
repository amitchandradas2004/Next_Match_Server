"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const auth_1 = require("../middleware/auth");
const aiChatController_1 = require("../controllers/aiChatController");
const router = (0, express_1.Router)();
// Protect all routes in this router
router.use(auth_1.protect);
router.post("/", aiChatController_1.postChat);
router.get("/:conversationId", aiChatController_1.getChatHistory);
router.delete("/:conversationId", aiChatController_1.deleteChatHistory);
exports.default = router;
