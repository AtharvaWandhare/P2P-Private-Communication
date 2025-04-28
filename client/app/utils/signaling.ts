import SockJS from 'sockjs-client';
import { Client } from '@stomp/stompjs';
import { updateRoomParticipants, getSession } from './storage';

const SIGNALING_SERVER_URL = 'http://localhost:8080/signaling';

export interface SignalMessage {
  type: 'offer' | 'answer' | 'ice-candidate' | 'initiator-selection' | 'end-session' | 'room-full';
  content: any;
  roomId: string;
  senderId: string;
}

export type SignalMessageCallback = (message: SignalMessage) => void;

class SignalingService {
  private stompClient: Client | null = null;
  private connected = false;
  private messageCallback: SignalMessageCallback | null = null;
  private roomId: string | null = null;
  private userId: string | null = null;

  connect(roomId: string, userId: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.connected) {
        resolve();
        return;
      }

      this.roomId = roomId;
      this.userId = userId;

      console.log('[Signaling] Connecting to server...');

      this.stompClient = new Client({
        webSocketFactory: () => new SockJS(SIGNALING_SERVER_URL),
        debug: function (str) {
          console.log('[STOMP] ' + str);
        },
        reconnectDelay: 5000,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
      });

      this.stompClient.onConnect = (frame) => {
        console.log('[Signaling] Connected to server');
        this.connected = true;

        // Subscribe to room messages
        console.log(`[Signaling] Subscribing to room: ${this.roomId}`);
        this.stompClient!.subscribe(
          `/topic/room/${this.roomId}`,
          (message) => {
            if (this.messageCallback) {
              const signalMessage: SignalMessage = JSON.parse(message.body);
              console.log('[Signaling] Received message:', signalMessage.type);

              // Handle end-session message
              if (signalMessage.type === 'end-session') {
                console.log('[Signaling] Session ended by peer');
                // If not from self, notify callback
                if (signalMessage.senderId !== this.userId) {
                  this.messageCallback(signalMessage);
                }
                return;
              }

              // Handle room-full message
              if (signalMessage.type === 'room-full') {
                console.log('[Signaling] Room is full');
                this.messageCallback(signalMessage);
                return;
              }

              // Ignore messages from self
              if (signalMessage.senderId !== this.userId) {
                this.messageCallback(signalMessage);
              }
            }
          }
        );

        // Update participants and check room capacity
        const participantCount = updateRoomParticipants(roomId, userId, true);
        console.log(`[Signaling] Room ${roomId} now has ${participantCount} participants`);

        // Check if room is already full (more than 2 participants)
        if (participantCount > 2) {
          console.log('[Signaling] Room is full, cannot join');
          // Notify others that someone tried to join a full room
          this.sendSignalMessage('room-full', {
            message: 'Room is already full with 2 participants'
          });
          // We'll still resolve the promise, but the UI should handle this case
          resolve();
          return;
        }

        // Send a presence signal to notify others
        this.sendKeepAlive();

        // Set up a keep-alive interval
        const interval = setInterval(() => {
          if (this.connected) {
            this.sendKeepAlive();
          } else {
            clearInterval(interval);
          }
        }, 30000); // Every 30 seconds

        resolve();
      };

      this.stompClient.onStompError = (frame) => {
        console.error('[Signaling] STOMP connection error:', frame);
        reject(new Error('STOMP connection error'));
      };

      // Start the STOMP client
      console.log('[Signaling] Activating STOMP client');
      this.stompClient.activate();
    });
  }

  // Send a keep-alive signal to maintain presence
  private sendKeepAlive(): void {
    // Only send if we're still in an active session
    const session = getSession();
    if (session && session.active && this.connected && this.roomId) {
      console.log('[Signaling] Sending keep-alive');
      this.sendSignalMessage('keep-alive', { timestamp: Date.now() });
    }
  }

  sendSignalMessage(type: SignalMessage['type'], content: any): void {
    if (!this.connected || !this.stompClient || !this.roomId || !this.userId) {
      console.error('[Signaling] Cannot send message: not connected');
      return;
    }

    const message: SignalMessage = {
      type,
      content,
      roomId: this.roomId,
      senderId: this.userId
    };

    console.log(`[Signaling] Sending ${type} message`);

    try {
      this.stompClient.publish({
        destination: '/app/signal',
        body: JSON.stringify(message)
      });
    } catch (error) {
      console.error('[Signaling] Error sending message:', error);
    }
  }

  onSignalMessage(callback: SignalMessageCallback): void {
    this.messageCallback = callback;
  }

  // Send end-session signal to all participants
  endSession(): void {
    if (this.connected && this.roomId) {
      console.log('[Signaling] Sending end-session signal');
      this.sendSignalMessage('end-session', {
        timestamp: Date.now(),
        message: 'Session ended by peer'
      });
    }
  }

  disconnect(): void {
    if (this.roomId && this.userId) {
      // Update participant count
      updateRoomParticipants(this.roomId, this.userId, false);
    }

    if (this.stompClient) {
      console.log('[Signaling] Disconnecting from server');
      this.stompClient.deactivate();
      this.connected = false;
      this.roomId = null;
      this.userId = null;
    }
  }

  // Check if the signaling service is connected
  isConnected(): boolean {
    return this.connected && this.stompClient !== null;
  }
}

// Singleton instance
export const signalingService = new SignalingService(); 