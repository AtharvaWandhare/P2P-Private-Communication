package com.p2pchat.model;

public class SignalMessage {
    private String type; // offer, answer, ice-candidate
    private Object content; // SDP or ICE candidate
    private String roomId; // Room identifier
    private String senderId; // Sender's identifier/nickname

    public SignalMessage() {
    }

    public SignalMessage(String type, Object content, String roomId, String senderId) {
        this.type = type;
        this.content = content;
        this.roomId = roomId;
        this.senderId = senderId;
    }

    public String getType() {
        return type;
    }

    public void setType(String type) {
        this.type = type;
    }

    public Object getContent() {
        return content;
    }

    public void setContent(Object content) {
        this.content = content;
    }

    public String getRoomId() {
        return roomId;
    }

    public void setRoomId(String roomId) {
        this.roomId = roomId;
    }

    public String getSenderId() {
        return senderId;
    }

    public void setSenderId(String senderId) {
        this.senderId = senderId;
    }
}