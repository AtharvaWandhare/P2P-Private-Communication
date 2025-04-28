import { MessageEvent } from './webrtc';

// Storage keys
const SESSION_KEY = 'p2pChat_session';
const MESSAGES_KEY = 'p2pChat_messages';
const PARTICIPANTS_KEY = 'p2pChat_participants';

// Session data interface
export interface SessionData {
  roomId: string;
  userId: string;
  active: boolean;
  startTime: number;
}

// Room participants
export interface RoomParticipants {
  count: number;
  users: string[]; // Array of user IDs
  lastUpdated: number;
}

/**
 * Saves the current session data
 */
export const saveSession = (roomId: string, userId: string): void => {
  const sessionData: SessionData = {
    roomId,
    userId,
    active: true,
    startTime: Date.now(),
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(sessionData));
};

/**
 * Gets the current session if it exists
 */
export const getSession = (): SessionData | null => {
  const data = localStorage.getItem(SESSION_KEY);
  if (!data) return null;

  try {
    return JSON.parse(data) as SessionData;
  } catch (e) {
    console.error('[Storage] Error parsing session data:', e);
    return null;
  }
};

/**
 * Ends the current session
 */
export const endSession = (): void => {
  const session = getSession();
  if (session) {
    // Mark as inactive but keep the data
    session.active = false;
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));

    // Clear participants for this room
    clearRoomParticipants(session.roomId);
  }
};

/**
 * Completely removes all session data
 */
export const clearSession = (): void => {
  localStorage.removeItem(SESSION_KEY);
};

/**
 * Saves messages to local storage
 */
export const saveMessages = (roomId: string, messages: MessageEvent[]): void => {
  const key = `${MESSAGES_KEY}_${roomId}`;
  localStorage.setItem(key, JSON.stringify(messages));
};

/**
 * Gets messages from local storage
 */
export const getMessages = (roomId: string): MessageEvent[] => {
  const key = `${MESSAGES_KEY}_${roomId}`;
  const data = localStorage.getItem(key);
  if (!data) return [];

  try {
    const parsed = JSON.parse(data);
    // Convert timestamp strings back to Date objects
    return parsed.map((msg: any) => ({
      ...msg,
      timestamp: new Date(msg.timestamp)
    }));
  } catch (e) {
    console.error('[Storage] Error parsing messages:', e);
    return [];
  }
};

/**
 * Clears messages for a specific room
 */
export const clearMessages = (roomId: string): void => {
  const key = `${MESSAGES_KEY}_${roomId}`;
  localStorage.removeItem(key);
};

/**
 * Manages room participants count
 */
export const updateRoomParticipants = (roomId: string, userId: string, joining: boolean): number => {
  const key = `${PARTICIPANTS_KEY}_${roomId}`;
  let participants: RoomParticipants = {
    count: 0,
    users: [],
    lastUpdated: Date.now()
  };

  const data = localStorage.getItem(key);
  if (data) {
    try {
      participants = JSON.parse(data);
    } catch (e) {
      console.error('[Storage] Error parsing participants data:', e);
    }
  }

  if (joining) {
    // Check if user is already counted
    if (!participants.users.includes(userId)) {
      participants.count++;
      participants.users.push(userId);
    }
  } else {
    // Remove user from room
    participants.users = participants.users.filter(id => id !== userId);
    participants.count = participants.users.length;
  }

  participants.lastUpdated = Date.now();
  localStorage.setItem(key, JSON.stringify(participants));

  return participants.count;
};

/**
 * Gets the number of participants in a room
 */
export const getRoomParticipantsCount = (roomId: string): number => {
  const key = `${PARTICIPANTS_KEY}_${roomId}`;
  const data = localStorage.getItem(key);
  if (!data) return 0;

  try {
    const participants = JSON.parse(data) as RoomParticipants;

    // Clean up stale data (older than 1 hour)
    const oneHourAgo = Date.now() - (60 * 60 * 1000);
    if (participants.lastUpdated < oneHourAgo) {
      localStorage.removeItem(key);
      return 0;
    }

    return participants.count;
  } catch (e) {
    console.error('[Storage] Error parsing participants count:', e);
    return 0;
  }
};

/**
 * Clears participants data for a room
 */
export const clearRoomParticipants = (roomId: string): void => {
  const key = `${PARTICIPANTS_KEY}_${roomId}`;
  localStorage.removeItem(key);
}; 