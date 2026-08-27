import { Router } from "express";

import {
    sendMessage,
    listGroupMessages
} from "../controllers/messageController.js";

const router = Router();

router.post("/", sendMessage);

router.get("/:groupId", listGroupMessages);

export default router;