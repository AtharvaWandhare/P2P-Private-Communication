'use client';

import { useEffect, useRef } from 'react';
import { MessageEvent } from '../utils/webrtc';

interface ChatBoxProps {
  messages: MessageEvent[];
  connectionStatus: string;
}

export default function ChatBox({ messages, connectionStatus }: ChatBoxProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Format timestamp to readable time
  const formatTime = (date: Date): string => {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Connection Status */}
      <div className={`py-2 px-4 text-sm text-center font-medium ${
        connectionStatus === 'open' 
          ? 'bg-green-100 text-green-800' 
          : connectionStatus === 'connecting' 
            ? 'bg-yellow-100 text-yellow-800'
            : 'bg-red-100 text-red-800'
      }`}>
        {connectionStatus === 'open' 
          ? 'Connected - Secure P2P Channel Established'
          : connectionStatus === 'connecting'
            ? 'Connecting...'
            : 'Disconnected'
        }
      </div>
      
      {/* Messages Container */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
        {messages.length === 0 ? (
          <div className="text-center text-gray-500 py-6">
            <p>No messages yet</p>
            <p className="text-sm mt-1">Messages are sent directly peer-to-peer and are not stored on any server</p>
          </div>
        ) : (
          messages.map((msg, index) => (
            <div 
              key={index} 
              className={`flex ${msg.isSelf ? 'justify-end' : 'justify-start'}`}
            >
              <div 
                className={`max-w-xs md:max-w-md rounded-lg px-4 py-2 ${
                  msg.isSelf 
                    ? 'bg-indigo-600 text-white rounded-br-none' 
                    : 'bg-white border border-gray-200 rounded-bl-none'
                }`}
              >
                {!msg.isSelf && (
                  <div className="text-xs text-gray-500 mb-1">
                    {msg.senderId}
                  </div>
                )}
                <div className="break-words">{msg.data}</div>
                <div className={`text-xs text-right mt-1 ${msg.isSelf ? 'text-indigo-200' : 'text-gray-400'}`}>
                  {formatTime(msg.timestamp)}
                </div>
              </div>
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>
    </div>
  );
} 