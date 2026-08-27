import {
    createMessage,
    getMessagesByGroup
} from "../models/messageModel.js";

const sendMessage = async (req, res, next) => {
    try {
        const message = await createMessage(req.body);

        res.status(201).json({
            message: "Message sent successfully.",
            data: message
        });
    } catch (error) {
        next(error);
    }
};

const listGroupMessages = async (req, res, next) => {
    try {
        const messages = await getMessagesByGroup(
            req.params.groupId
        );

        res.json({
            message: "Messages retrieved successfully.",
            data: messages
        });
    } catch (error) {
        next(error);
    }
};

export {
    sendMessage,
    listGroupMessages
};