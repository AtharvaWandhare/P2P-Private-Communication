'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { webRTCService, MessageEvent } from '../utils/webrtc';
import { signalingService } from '../utils/signaling';
import { getSession } from '../utils/storage';

// Simple Message component with inline styles
const Message = ({ message }: { message: MessageEvent }) => {
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div style={{
      display: 'flex',
      justifyContent: message.isSelf ? 'flex-end' : 'flex-start',
      marginBottom: '8px'
    }}>
      <div style={{
        maxWidth: '70%',
        padding: '8px 12px',
        borderRadius: '8px',
        backgroundColor: message.isSelf ? '#4338ca' : 'white',
        color: message.isSelf ? 'white' : 'black',
        border: message.isSelf ? 'none' : '1px solid #e5e7eb',
        boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
      }}>
        {!message.isSelf && (
          <div style={{ fontSize: '0.75rem', color: '#6b7280', marginBottom: '4px' }}>
            {message.senderId}
          </div>
        )}
        <div style={{ wordBreak: 'break-word' }}>{message.data}</div>
        <div style={{
          fontSize: '0.75rem',
          textAlign: 'right',
          marginTop: '4px',
          color: message.isSelf ? 'rgba(255, 255, 255, 0.7)' : '#9ca3af'
        }}>
          {formatTime(message.timestamp)}
        </div>
      </div>
    </div>
  );
};

// Notification component for copying room ID
const Notification = ({ message, isVisible, type = 'success' }: { message: string, isVisible: boolean, type?: 'success' | 'error' }) => {
  const bgColor = type === 'success' ? '#dcfce7' : '#fee2e2';
  const textColor = type === 'success' ? '#15803d' : '#b91c1c';
  const borderColor = type === 'success' ? '#86efac' : '#fca5a5';
  
  if (!isVisible) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: '16px',
      right: '16px',
      padding: '12px 16px',
      borderRadius: '6px',
      backgroundColor: bgColor,
      color: textColor,
      border: `1px solid ${borderColor}`,
      boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
      zIndex: 50,
      maxWidth: '300px',
      animation: 'fade-in 0.3s ease-out'
    }}>
      {message}
    </div>
  );
};

export default function ChatPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Get roomId and nickname from URL params
  const roomId = searchParams.get('roomId');
  const nickname = searchParams.get('nickname');

  const [messages, setMessages] = useState<MessageEvent[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<string>('connecting');
  const [inputMessage, setInputMessage] = useState<string>('');
  const [isRoomFull, setIsRoomFull] = useState<boolean>(false);
  const [sessionEnded, setSessionEnded] = useState<boolean>(false);
  const [endedByPeer, setEndedByPeer] = useState<boolean>(false);
  const [notification, setNotification] = useState<{message: string, visible: boolean, type: 'success' | 'error'}>({
    message: '',
    visible: false,
    type: 'success'
  });

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Improved function to load messages from storage
  const loadMessagesFromStorage = () => {
    if (!roomId) return;

    console.log('[Chat] Loading messages from storage for room:', roomId);
    const storedMessages = webRTCService.getStoredMessages();
    console.log('[Chat] Found stored messages:', storedMessages.length);
    
    if (storedMessages.length > 0) {
      setMessages(storedMessages);
    }
  };

  // Check for existing session and restore messages
  useEffect(() => {
    if (!roomId || !nickname) {
      router.push('/');
      return;
    }

    // Check if we have an existing session
    const session = getSession();
    console.log('[Chat] Checking for existing session:', session);
    
    // Load previous messages regardless of session status
    loadMessagesFromStorage();
    
    // Generate a random value for initiator selection
    const randomValue = Math.random();
    console.log(`[Chat] Generated random value for initiator selection: ${randomValue}`);

    // Initialize WebRTC if we have valid room and nickname
    let timeoutId: NodeJS.Timeout | null = null;
    const initChatPromise = initializeChat(roomId, nickname, randomValue);
    initChatPromise.then(timeout => {
      timeoutId = timeout;
    });

    // Clean up WebRTC resources when component unmounts
    return () => {
      if (timeoutId) clearTimeout(timeoutId);
      if (!sessionEnded) {
        webRTCService.cleanup();
      }
    };
  }, [roomId, nickname, router, sessionEnded]);

  // Fix: Ensure signaling callback is properly preserved on reconnection
  // Add a dedicated function for WebRTC initialization outside useEffect
  const initializeChat = async (roomId: string, nickname: string, randomValue: number) => {
    console.log('[Chat] Initializing chat with room:', roomId, 'nickname:', nickname);
    let actualInitiator = false;
    
    try {
      await webRTCService.initialize(roomId, nickname, {
        onMessageReceived: (message) => {
          setMessages((prev) => {
            // Check if message already exists to prevent duplicates
            const isDuplicate = prev.some(msg => 
              msg.data === message.data && 
              msg.senderId === message.senderId && 
              msg.timestamp.getTime() === message.timestamp.getTime()
            );
            
            if (isDuplicate) return prev;
            const newMessages = [...prev, message];
            return newMessages;
          });
        },
        onConnectionStateChange: (state) => {
          console.log('[Chat] Connection state:', state);
        },
        onChannelStatusChange: (status) => {
          console.log('[Chat] Channel status changed to:', status);
          setConnectionStatus(status);
        },
        onSessionEnded: (wasEndedByPeer) => {
          console.log('[Chat] Session ended, by peer:', wasEndedByPeer);
          setSessionEnded(true);
          setEndedByPeer(wasEndedByPeer);
          // Redirect back to home after short delay
          setTimeout(() => {
            router.push('/');
          }, 3000);
        },
        onRoomFull: () => {
          console.log('[Chat] Room is full');
          setIsRoomFull(true);
          // Redirect back to home after short delay
          setTimeout(() => {
            router.push('/');
          }, 3000);
        }
      });

      // After connecting to signaling, send our random value
      console.log('[Chat] Sending initiator selection value');
      signalingService.sendSignalMessage('initiator-selection', {
        randomValue,
        timestamp: Date.now()
      });
      
      console.log('[Chat] Setting up signaling message handler');
      
      // Re-attach the signal message handler to ensure it's working after refresh
      signalingService.onSignalMessage((message) => {
        console.log('[Chat] Received signal message:', message.type);
        
        if (message.type === 'initiator-selection') {
          const theirValue = message.content.randomValue;
          const theirTimestamp = message.content.timestamp;
          const ourTimestamp = Date.now();

          console.log(`[Chat] Received other client's random value: ${theirValue}`);

          // Compare values - higher value becomes initiator
          // If values are equal, use timestamp as tiebreaker
          if (randomValue > theirValue ||
            (randomValue === theirValue && ourTimestamp < theirTimestamp)) {
            console.log('[Chat] We become the initiator');
            actualInitiator = true;
            webRTCService.createPeerConnectionAsInitiator();
          } else {
            console.log('[Chat] We become the receiver');
            actualInitiator = false;
            webRTCService.createPeerConnectionAsReceiver();
          }
        } else {
          // Handle regular WebRTC signals
          webRTCService.handleSignalingMessage(message);
        }
      });
      
      // Set a timeout to become initiator if no other client joins
      const timeout = setTimeout(() => {
        if (!actualInitiator && connectionStatus !== 'open') {
          console.log('[Chat] No other client detected, becoming initiator by default');
          actualInitiator = true;
          webRTCService.createPeerConnectionAsInitiator();
        }
      }, 3000);
      
      return timeout;
    } catch (error) {
      console.error('[Chat] Failed to initialize WebRTC:', error);
      setConnectionStatus('closed');
      return null;
    }
  };

  // Handle sending a message
  const handleSendMessage = () => {
    if (connectionStatus === 'open' && inputMessage.trim()) {
      webRTCService.sendMessage(inputMessage.trim());
      setInputMessage('');
    }
  };

  // Handle Enter key press
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  // Function to copy room ID
  const copyRoomId = async () => {
    try {
      await navigator.clipboard.writeText(roomId || '');
      // Show notification instead of using browser alert
      setNotification({
        message: 'Room ID copied to clipboard!',
        visible: true,
        type: 'success'
      });
      
      // Hide notification after 2 seconds
      setTimeout(() => {
        setNotification(prev => ({...prev, visible: false}));
      }, 2000);
    } catch (err) {
      console.error('Failed to copy text: ', err);
      setNotification({
        message: 'Failed to copy Room ID',
        visible: true,
        type: 'error'
      });
      
      setTimeout(() => {
        setNotification(prev => ({...prev, visible: false}));
      }, 2000);
    }
  };

  // End session handler
  const handleEndSession = () => {
    webRTCService.endSession();
  };

  if (!roomId || !nickname) {
    return null; // Will redirect to home page
  }

  // Handle room full or session ended conditions
  if (isRoomFull) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '20px',
        backgroundColor: '#f3f4f6',
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '32px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          maxWidth: '500px'
        }}>
          <h2 style={{ color: '#ef4444', fontSize: '24px', marginBottom: '16px' }}>
            Room is Full
          </h2>
          <p style={{ marginBottom: '20px', color: '#4b5563' }}>
            This room already has two participants and cannot accept more connections.
          </p>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
            Redirecting to home page...
          </p>
        </div>
      </div>
    );
  }

  if (sessionEnded) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100vh',
        padding: '20px',
        backgroundColor: '#f3f4f6',
        textAlign: 'center'
      }}>
        <div style={{
          backgroundColor: 'white',
          padding: '32px',
          borderRadius: '8px',
          boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
          maxWidth: '500px'
        }}>
          <h2 style={{ color: '#4338ca', fontSize: '24px', marginBottom: '16px' }}>
            Chat Session Ended
          </h2>
          <p style={{ marginBottom: '20px', color: '#4b5563' }}>
            {endedByPeer
              ? "The other participant has ended the chat session."
              : "You've ended the chat session."}
          </p>
          <p style={{ color: '#6b7280', fontSize: '14px', marginBottom: '24px' }}>
            Redirecting to home page...
          </p>
        </div>
      </div>
    );
  }

  // Get status color
  const getStatusColor = () => {
    if (connectionStatus === 'open') {
      return { bg: '#dcfce7', text: '#15803d' }; // Green for connected
    } else if (connectionStatus === 'connecting') {
      return { bg: '#fef9c3', text: '#854d0e' }; // Yellow for connecting
    } else {
      return { bg: '#fee2e2', text: '#b91c1c' }; // Red for disconnected
    }
  };

  const statusColor = getStatusColor();

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100vh',
      backgroundColor: '#f3f4f6'
    }}>
      {/* Show notification */}
      <Notification 
        message={notification.message} 
        isVisible={notification.visible} 
        type={notification.type} 
      />
      
      {/* Header */}
      <header style={{
        backgroundColor: '#4338ca',
        color: 'white',
        padding: '16px',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}>
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between'
        }}>
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center'
          }}>
            <h1 style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>P2P Private Chat</h1>
            <button
              onClick={handleEndSession}
              style={{
                backgroundColor: '#ef4444',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '6px 12px',
                fontSize: '14px',
                cursor: 'pointer'
              }}
            >
              End Session
            </button>
          </div>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            marginTop: '8px'
          }}>
            <span style={{ marginRight: '8px', fontSize: '0.875rem', color: '#c7d2fe' }}>Room ID:</span>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{
                fontSize: '0.875rem',
                backgroundColor: '#3730a3',
                padding: '4px 8px',
                borderRadius: '4px',
                marginRight: '8px',
                fontFamily: 'monospace'
              }}>
                {roomId}
              </span>
              <button
                onClick={copyRoomId}
                style={{
                  fontSize: '0.75rem',
                  backgroundColor: '#4f46e5',
                  padding: '4px 8px',
                  borderRadius: '4px',
                  border: 'none',
                  cursor: 'pointer',
                  color: 'white'
                }}
              >
                Copy
              </button>
            </div>
          </div>
        </div>
        <div style={{ marginTop: '8px', fontSize: '0.875rem', color: '#c7d2fe' }}>
          <span>Connected as: </span>
          <span style={{ fontWeight: '600' }}>{nickname}</span>
        </div>
      </header>

      {/* Connection status */}
      <div style={{
        padding: '8px 16px',
        fontSize: '0.875rem',
        fontWeight: '500',
        textAlign: 'center',
        backgroundColor: statusColor.bg,
        color: statusColor.text
      }}>
        {connectionStatus === 'open'
          ? 'Connected - Secure P2P Channel Established'
          : connectionStatus === 'connecting'
            ? 'Connecting...'
            : 'Disconnected'
        }
      </div>

      {/* Main chat area */}
      <div style={{
        flex: '1',
        overflowY: 'auto',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column'
      }}>
        {messages.length === 0 ? (
          <div style={{
            textAlign: 'center',
            color: '#6b7280',
            marginTop: '32px',
            marginBottom: '32px'
          }}>
            <p>No messages yet</p>
            <p style={{ fontSize: '0.875rem', marginTop: '4px' }}>
              Messages are sent directly peer-to-peer and are stored locally until the session ends
            </p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <Message key={index} message={msg} />
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Message input */}
      <div style={{
        padding: '12px',
        borderTop: '1px solid #e5e7eb',
        backgroundColor: 'white'
      }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            value={inputMessage}
            onChange={(e) => setInputMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={connectionStatus === 'open' ? "Type a message..." : "Waiting for connection..."}
            disabled={connectionStatus !== 'open'}
            style={{
              flex: '1',
              padding: '8px 16px',
              border: '1px solid #d1d5db',
              borderRadius: '6px',
              outline: 'none',
              backgroundColor: connectionStatus === 'open' ? 'white' : '#f3f4f6',
              color: '#000000',
              caretColor: '#000000'
            }}
          />
          <button
            onClick={handleSendMessage}
            disabled={connectionStatus !== 'open' || !inputMessage.trim()}
            style={{
              padding: '8px 16px',
              backgroundColor: connectionStatus === 'open' && inputMessage.trim() ? '#4338ca' : '#9ca3af',
              color: 'white',
              fontWeight: '500',
              borderRadius: '6px',
              border: 'none',
              cursor: connectionStatus === 'open' && inputMessage.trim() ? 'pointer' : 'not-allowed'
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
} 