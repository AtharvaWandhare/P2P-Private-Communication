package com.p2pchat.controller;

import com.p2pchat.model.SignalMessage;
import org.springframework.messaging.handler.annotation.MessageMapping;
import org.springframework.messaging.handler.annotation.Payload;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.stereotype.Controller;

@Controller
public class SignalingController {

    private final SimpMessagingTemplate messagingTemplate;

    public SignalingController(SimpMessagingTemplate messagingTemplate) {
        this.messagingTemplate = messagingTemplate;
    }

    @MessageMapping("/signal")
    public void handleSignalMessage(@Payload SignalMessage message) {
        // Forward the signaling message to all clients in the room
        // This enables WebRTC negotiation between peers
        messagingTemplate.convertAndSend(
                "/topic/room/" + message.getRoomId(),
                message);
    }
}