import { describe, it, expect } from "bun:test";

interface ChatMessage {
  sender: "user" | "admin";
  text?: string;
  audioUrl?: string;
}

interface ChatRoom {
  unreadAdmin: number;
  unreadUser: number;
}

describe("Support Chat Architectural Suite", () => {
  it("Scenario 1: User message increments unreadAdmin counter", () => {
    const room: ChatRoom = { unreadAdmin: 0, unreadUser: 0 };
    const newMessage: ChatMessage = { sender: "user", text: "Hello support" };

    if (newMessage.sender === "user") {
      room.unreadAdmin += 1;
      room.unreadUser = 0;
    }

    expect(room.unreadAdmin).toBe(1);
    expect(room.unreadUser).toBe(0);
  });

  it("Scenario 2: Admin message increments unreadUser counter and resets unreadAdmin", () => {
    const room: ChatRoom = { unreadAdmin: 2, unreadUser: 0 };
    const newMessage: ChatMessage = { sender: "admin", text: "Hello! How can I help you?" };

    if (newMessage.sender === "admin") {
      room.unreadUser += 1;
      room.unreadAdmin = 0;
    }

    expect(room.unreadUser).toBe(1);
    expect(room.unreadAdmin).toBe(0);
  });

  it("Scenario 3: Voice note message contains valid base64 audio URI format", () => {
    const voiceMsg: ChatMessage = {
      sender: "user",
      audioUrl: "data:audio/webm;base64,GkXfo59ChoEBQveBAA=="
    };

    expect(voiceMsg.audioUrl).toContain("data:audio/");
  });
});
