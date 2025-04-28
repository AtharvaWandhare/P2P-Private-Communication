import { signalingService, SignalMessage } from './signaling';
import { saveMessages, getMessages, saveSession, endSession, updateRoomParticipants, clearMessages, clearSession, clearRoomParticipants } from './storage';

// WebRTC configuration with STUN servers
const RTCConfig: RTCConfiguration = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
  ],
};

// Message event type
export interface MessageEvent {
  data: string;
  senderId: string;
  isSelf: boolean;
  timestamp: Date;
}

// WebRTC event callbacks
export interface WebRTCCallbacks {
  onMessageReceived: (message: MessageEvent) => void;
  onConnectionStateChange: (state: RTCPeerConnectionState) => void;
  onChannelStatusChange: (status: 'open' | 'closed' | 'connecting') => void;
  onSessionEnded: (endedByPeer: boolean) => void;
  onRoomFull: () => void;
}

export class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private dataChannel: RTCDataChannel | null = null;
  private roomId: string | null = null;
  private nickname: string | null = null;
  private callbacks: WebRTCCallbacks = {} as WebRTCCallbacks;
  private isInitiator: boolean = false;
  private storedMessages: MessageEvent[] = [];
  private isReconnecting: boolean = false;
  private maxReconnectAttempts: number = 5;
  private reconnectAttempts: number = 0;
  private reconnectionDelay: number = 1000;
  private isSessionActive: boolean = false;
  private pendingIceCandidates: RTCIceCandidate[] = [];
  private remoteDescriptionSet: boolean = false;

  constructor() {
    // Immediately load any stored messages when the service is created
    this.loadStoredMessages();
  }

  private loadStoredMessages() {
    try {
      if (this.roomId) {
        const messages = getMessages(this.roomId);
        if (messages && messages.length > 0) {
          // Convert all string timestamps back to Date objects
          this.storedMessages = messages.map(msg => ({
            ...msg,
            timestamp: new Date(msg.timestamp)
          }));
          console.log(`[WebRTC] Loaded ${this.storedMessages.length} messages from storage`);
        }
      }
    } catch (error) {
      console.error('[WebRTC] Error loading stored messages:', error);
    }
  }

  private persistMessages() {
    try {
      if (this.roomId) {
        saveMessages(this.roomId, this.storedMessages);
        console.log(`[WebRTC] Saved ${this.storedMessages.length} messages to storage`);
      }
    } catch (error) {
      console.error('[WebRTC] Error saving messages to storage:', error);
    }
  }

  async initialize(roomId: string, nickname: string, callbacks: WebRTCCallbacks): Promise<void> {
    console.log(`[WebRTC] Initializing with roomId: ${roomId}, nickname: ${nickname}`);
    this.roomId = roomId;
    this.nickname = nickname;
    this.callbacks = callbacks;
    this.isSessionActive = true;

    // Clean up any existing connections first
    this.cleanup();

    // Reset state
    this.remoteDescriptionSet = false;
    this.pendingIceCandidates = [];
    this.isInitiator = false;

    // Save the current session
    saveSession(roomId, nickname);

    // Update participants count
    if (this.nickname) {
      updateRoomParticipants(roomId, this.nickname, true);
    }

    // Load stored messages for this room
    this.loadStoredMessages();

    // Notify about all stored messages
    if (this.storedMessages.length > 0 && this.callbacks.onMessageReceived) {
      console.log(`[WebRTC] Notifying about ${this.storedMessages.length} stored messages`);
      for (const message of this.storedMessages) {
        this.callbacks.onMessageReceived(message);
      }
    }

    try {
      // Connect to signaling service
      await signalingService.connect(roomId, nickname);

      // Create peer connection as receiver by default
      // This ensures we have a peer connection before handling any signals
      this.createPeerConnectionAsReceiver();

      // Set up the signaling message handler
      signalingService.onSignalMessage(this.handleSignalingMessage);

      return Promise.resolve();
    } catch (error) {
      console.error('[WebRTC] Error during initialization:', error);
      return Promise.reject(error);
    }
  }

  // Create peer connection as initiator (first user in room)
  async createPeerConnectionAsInitiator(): Promise<void> {
    console.log('[WebRTC] Creating peer connection as initiator');

    // If we're in another state, clean up first
    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    this.isInitiator = true;
    this.remoteDescriptionSet = false;
    this.pendingIceCandidates = [];

    this.createPeerConnection();
    this.setupDataChannel();

    try {
      // Make sure signaling is connected
      if (!signalingService.isConnected()) {
        console.warn('[WebRTC] Signaling not connected, attempting reconnection');
        if (this.roomId && this.nickname) {
          await signalingService.connect(this.roomId, this.nickname);
        } else {
          throw new Error('Cannot reconnect signaling: missing roomId or nickname');
        }
      }

      // Create and send offer
      console.log('[WebRTC] Creating offer');
      const offer = await this.peerConnection!.createOffer();
      console.log('[WebRTC] Setting local description (offer)');
      await this.peerConnection!.setLocalDescription(offer);
      console.log('[WebRTC] Sending offer via signaling server');
      signalingService.sendSignalMessage('offer', offer);
    } catch (error) {
      console.error('[WebRTC] Error creating offer:', error);
    }
  }

  // Create peer connection as non-initiator (second user)
  createPeerConnectionAsReceiver(): void {
    console.log('[WebRTC] Creating peer connection as receiver');
    this.isInitiator = false;
    this.createPeerConnection();
  }

  // Send a message through the data channel
  sendMessage(message: string): void {
    if (!this.dataChannel || this.dataChannel.readyState !== 'open') {
      console.warn('[WebRTC] Cannot send message: data channel is not open');
      return;
    }

    try {
      const messageEvent: MessageEvent = {
        data: message,
        senderId: this.nickname || 'Unknown',
        isSelf: true,
        timestamp: new Date()
      };

      // Send the message through the data channel
      const dataToSend = {
        content: message,
        senderId: this.nickname || 'Unknown',
        timestamp: messageEvent.timestamp
      };

      this.dataChannel.send(JSON.stringify(dataToSend));

      // Save own messages to storage
      this.storedMessages.push(messageEvent);
      this.persistMessages();

      // Notify about own messages
      if (this.callbacks.onMessageReceived) {
        this.callbacks.onMessageReceived(messageEvent);
      }
    } catch (error) {
      console.error('[WebRTC] Error sending message:', error);
    }
  }

  // End the session
  endSession(): void {
    console.log('[WebRTC] Ending session');
    this.isSessionActive = false;

    try {
      // Send end-session signal if connected
      if (signalingService.isConnected()) {
        signalingService.endSession();
      }

      // Store roomId for cleanup
      const currentRoomId = this.roomId;

      // End session in storage
      endSession();

      // Clear ALL data for this room
      if (currentRoomId) {
        // Clear messages
        clearMessages(currentRoomId);

        // Clear participants
        clearRoomParticipants(currentRoomId);

        console.log(`[WebRTC] Cleared all data for room: ${currentRoomId}`);
      }

      // Clear session data completely
      clearSession();

      // Notify UI
      if (this.callbacks) {
        this.callbacks.onSessionEnded(false);
      }

      // Clean up connections
      this.cleanup();
    } catch (error) {
      console.error('[WebRTC] Error ending session:', error);
    }
  }

  // Get stored messages for current room
  getStoredMessages(): MessageEvent[] {
    if (!this.roomId) return [];
    return getMessages(this.roomId);
  }

  // Clean up resources
  cleanup(): void {
    console.log('[WebRTC] Cleaning up resources');

    // Reset state variables
    this.remoteDescriptionSet = false;
    this.pendingIceCandidates = [];
    this.storedMessages = [];
    this.reconnectAttempts = 0;
    this.isReconnecting = false;

    if (this.dataChannel) {
      this.dataChannel.close();
      this.dataChannel = null;
    }

    if (this.peerConnection) {
      this.peerConnection.close();
      this.peerConnection = null;
    }

    // Attempt to disconnect from signaling, even if we failed to connect earlier
    try {
      signalingService.disconnect();
    } catch (error) {
      console.error('[WebRTC] Error disconnecting from signaling:', error);
    }
  }

  // Start reconnection process
  private attemptReconnection(): void {
    if (this.isReconnecting || !this.isSessionActive) return;

    this.isReconnecting = true;
    this.reconnectAttempts = 0;

    console.log('[WebRTC] Starting reconnection process');
    this.handleDisconnection();
  }

  // Private methods
  private createPeerConnection(): void {
    console.log('[WebRTC] Creating RTCPeerConnection');
    this.peerConnection = new RTCPeerConnection(RTCConfig);

    // Set up ICE candidate handling
    this.peerConnection.onicecandidate = (event) => {
      if (event.candidate) {
        console.log('[WebRTC] New ICE candidate', event.candidate.candidate?.substring(0, 50) + '...');
        signalingService.sendSignalMessage('ice-candidate', event.candidate);
      }
    };

    this.peerConnection.oniceconnectionstatechange = () => {
      console.log('[WebRTC] ICE connection state:', this.peerConnection?.iceConnectionState);

      // Handle disconnection
      if (this.peerConnection?.iceConnectionState === 'disconnected' ||
        this.peerConnection?.iceConnectionState === 'failed') {
        this.handleDisconnection();
      }
    };

    // Handle data channel if we're not the initiator
    this.peerConnection.ondatachannel = (event) => {
      console.log('[WebRTC] Data channel received from peer');
      if (!this.isInitiator) {
        this.dataChannel = event.channel;
        this.setupDataChannelHandlers();
      }
    };

    // Monitor connection state
    this.peerConnection.onconnectionstatechange = () => {
      const state = this.peerConnection?.connectionState;
      console.log('[WebRTC] Connection state change:', state);
      if (this.callbacks && this.peerConnection) {
        this.callbacks.onConnectionStateChange(this.peerConnection.connectionState);
      }
    };
  }

  // Handle disconnection with reconnection attempts
  private handleDisconnection(): void {
    if (!this.isSessionActive) return;

    console.log(`[WebRTC] Attempting to reconnect (${this.reconnectAttempts + 1}/${this.maxReconnectAttempts})`);

    if (this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;

      // Clean up existing connection
      if (this.peerConnection) {
        this.peerConnection.close();
        this.peerConnection = null;
      }

      // Create new connection
      setTimeout(() => {
        if (this.isInitiator) {
          this.createPeerConnectionAsInitiator();
        } else {
          this.createPeerConnectionAsReceiver();
        }
      }, this.reconnectionDelay); // Wait before reconnecting
    } else {
      console.log('[WebRTC] Max reconnection attempts reached');
      this.isReconnecting = false;
      if (this.callbacks) {
        this.callbacks.onChannelStatusChange('closed');
      }
    }
  }

  private setupDataChannel(): void {
    if (!this.peerConnection) return;

    // Create data channel (only done by initiator)
    console.log('[WebRTC] Creating data channel');
    this.dataChannel = this.peerConnection.createDataChannel('chat', {
      ordered: true, // Guarantee message order
    });

    this.setupDataChannelHandlers();
  }

  private setupDataChannelHandlers(): void {
    if (!this.dataChannel) return;

    this.dataChannel.onopen = () => {
      console.log('[WebRTC] Data channel open');
      this.reconnectAttempts = 0; // Reset reconnect attempts
      this.isReconnecting = false;
      if (this.callbacks) {
        this.callbacks.onChannelStatusChange('open');
      }
    };

    this.dataChannel.onclose = () => {
      console.log('[WebRTC] Data channel closed');
      if (this.callbacks) {
        this.callbacks.onChannelStatusChange('closed');
      }

      // Start reconnection if not already reconnecting
      if (!this.isReconnecting && this.isSessionActive) {
        this.attemptReconnection();
      }
    };

    this.dataChannel.onmessage = (event) => {
      console.log('[WebRTC] Message received');
      try {
        const messageObj = JSON.parse(event.data);

        if (this.callbacks) {
          const newMessage: MessageEvent = {
            data: messageObj.content,
            senderId: messageObj.senderId,
            isSelf: false,
            timestamp: new Date(messageObj.timestamp),
          };

          this.callbacks.onMessageReceived(newMessage);

          // Save message to storage
          this.storedMessages.push(newMessage);
          this.persistMessages();
        }
      } catch (error) {
        console.error('[WebRTC] Error processing received message:', error);
      }
    };
  }

  handleSignalingMessage = async (message: SignalMessage) => {
    // Special message handling
    if (message.type === 'end-session') {
      console.log('[WebRTC] Session end message received');
      this.isSessionActive = false;

      // Store roomId for cleanup
      const currentRoomId = this.roomId;

      // Clear ALL data for this room
      if (currentRoomId) {
        // Clear messages
        clearMessages(currentRoomId);

        // Clear participants
        clearRoomParticipants(currentRoomId);

        console.log(`[WebRTC] Cleared all data for room: ${currentRoomId}`);
      }

      // Clear session completely
      clearSession();

      if (this.callbacks) {
        this.callbacks.onSessionEnded(true);
      }

      // Clean up connection
      this.cleanup();
      return;
    }

    if (message.type === 'room-full') {
      console.log('[WebRTC] Room full message received');
      if (this.callbacks) {
        this.callbacks.onRoomFull();
      }
      return;
    }

    // Ensure peer connection exists
    if (!this.peerConnection) {
      console.log('[WebRTC] Creating peer connection to handle incoming signal');
      this.createPeerConnectionAsReceiver();

      // If still no peer connection, we can't proceed
      if (!this.peerConnection) {
        console.error('[WebRTC] Failed to create peer connection');
        return;
      }
    }

    console.log(`[WebRTC] Handling ${message.type} from signaling server`);

    switch (message.type) {
      case 'offer':
        try {
          // Check if we're in a state to receive an offer
          const currentState = this.peerConnection.signalingState;

          // Reset connection if not in stable state
          if (currentState !== 'stable') {
            console.warn(`[WebRTC] Can't set remote offer in state: ${currentState}, resetting connection`);

            // Reset connection to start fresh
            if (this.peerConnection) {
              this.peerConnection.close();
              this.peerConnection = null;
            }

            this.createPeerConnectionAsReceiver();
            this.remoteDescriptionSet = false;
            this.pendingIceCandidates = [];

            // If still no peer connection, we can't proceed
            if (!this.peerConnection) {
              console.error('[WebRTC] Failed to create new peer connection');
              return;
            }
          }

          console.log('[WebRTC] Setting remote description (offer)');
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.content));
          this.remoteDescriptionSet = true;

          // Apply any pending ICE candidates
          this.processPendingIceCandidates();

          console.log('[WebRTC] Creating answer');
          const answer = await this.peerConnection.createAnswer();
          console.log('[WebRTC] Setting local description (answer)');
          await this.peerConnection.setLocalDescription(answer);

          // Make sure signaling is connected before sending
          if (signalingService.isConnected()) {
            console.log('[WebRTC] Sending answer');
            signalingService.sendSignalMessage('answer', answer);
          } else {
            console.error('[WebRTC] Cannot send answer: signaling not connected');
          }
        } catch (error) {
          console.error('[WebRTC] Error handling offer:', error);
          this.remoteDescriptionSet = false;
        }
        break;

      case 'answer':
        try {
          // Check if we're in a state to receive an answer
          const currentState = this.peerConnection.signalingState;
          if (currentState !== 'have-local-offer') {
            console.warn(`[WebRTC] Can't set remote answer in state: ${currentState}, ignoring`);
            return;
          }

          console.log('[WebRTC] Setting remote description (answer)');
          await this.peerConnection.setRemoteDescription(new RTCSessionDescription(message.content));
          this.remoteDescriptionSet = true;

          // Apply any pending ICE candidates
          this.processPendingIceCandidates();

          console.log('[WebRTC] Connection setup complete');
        } catch (error) {
          console.error('[WebRTC] Error handling answer:', error);
          this.remoteDescriptionSet = false;
        }
        break;

      case 'ice-candidate':
        try {
          const candidate = new RTCIceCandidate(message.content);

          // If we haven't set remote description yet, save this candidate for later
          if (!this.remoteDescriptionSet) {
            console.log('[WebRTC] Buffering ICE candidate until remote description is set');
            this.pendingIceCandidates.push(candidate);
            return;
          }

          console.log('[WebRTC] Adding ICE candidate');
          await this.peerConnection.addIceCandidate(candidate);
        } catch (error) {
          console.error('[WebRTC] Error adding ICE candidate:', error);
          // Store this candidate for later retry
          if (message.content) {
            this.pendingIceCandidates.push(new RTCIceCandidate(message.content));
          }
        }
        break;
    }
  };

  // Process any pending ICE candidates
  private processPendingIceCandidates(): void {
    if (!this.peerConnection || !this.remoteDescriptionSet || this.pendingIceCandidates.length === 0) {
      return;
    }

    console.log(`[WebRTC] Processing ${this.pendingIceCandidates.length} pending ICE candidates`);

    // Process all queued candidates
    this.pendingIceCandidates.forEach(async (candidate) => {
      try {
        await this.peerConnection!.addIceCandidate(candidate);
      } catch (error) {
        console.error('[WebRTC] Error adding pending ICE candidate:', error);
      }
    });

    // Clear the queue
    this.pendingIceCandidates = [];
  }
}

// Singleton instance
export const webRTCService = new WebRTCService(); 