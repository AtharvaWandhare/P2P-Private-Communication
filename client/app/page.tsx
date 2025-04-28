'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';

export default function Home() {
  const router = useRouter();
  const [nickname, setNickname] = useState('');
  const [roomId, setRoomId] = useState('');
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  // Handle joining a room
  const handleJoinRoom = (e: React.FormEvent) => {
    e.preventDefault();

    if (!nickname.trim()) {
      setError('Please enter a nickname');
      return;
    }

    if (!roomId.trim()) {
      setError('Please enter a room ID');
      return;
    }

    // Store user info in sessionStorage (temporary, only for this session)
    sessionStorage.setItem('p2pChat_nickname', nickname);
    sessionStorage.setItem('p2pChat_roomId', roomId);

    // Navigate to chat page with room ID and nickname as query params
    router.push(`/chat?roomId=${encodeURIComponent(roomId)}&nickname=${encodeURIComponent(nickname)}`);
  };

  const generateRoomId = () => {
    const newRoomId = uuidv4();
    setRoomId(newRoomId);

    // Auto-copy to clipboard
    navigator.clipboard.writeText(newRoomId)
      .then(() => {
        // Show a toast or notification that ID was copied
        // alert('Room ID copied to clipboard!');
        setMsg('Room ID copied to clipboard!');
        setTimeout(() => {
          setMsg('');
        }, 3000);
      })
      .catch(err => {
        console.error('Could not copy room ID: ', err);
      });
  };

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      padding: '1rem',
      backgroundColor: '#f0f4ff'
    }}>
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <h1 style={{ fontSize: '2rem', fontWeight: 'bold', color: '#4338ca', marginBottom: '0.5rem' }}>
          P2P Private Chat
        </h1>
        <p style={{ color: '#4b5563', maxWidth: '28rem' }}>
          End-to-end encrypted messaging with no server storage.
          Your conversations stay between you and your peer.
        </p>
      </div>

      <div style={{
        maxWidth: '28rem',
        width: '100%',
        padding: '1.5rem',
        backgroundColor: 'white',
        borderRadius: '0.5rem',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)'
      }}>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginBottom: '1.5rem', textAlign: 'center', color: '#4338ca' }}>
          Join Private Chat Room
        </h2>

        {error && (
          <div style={{
            marginBottom: '1rem',
            padding: '0.75rem',
            backgroundColor: '#fee2e2',
            color: '#b91c1c',
            borderRadius: '0.375rem'
          }}>
            {error}
          </div>
        )}

        <form onSubmit={handleJoinRoom}>
          <div style={{ marginBottom: '1rem' }}>
            <label
              htmlFor="nickname"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}
            >
              Your Nickname
            </label>
            <input
              type="text"
              id="nickname"
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
              placeholder="Enter a nickname"
              style={{
                width: '100%',
                padding: '0.5rem 0.75rem',
                border: '1px solid #d1d5db',
                borderRadius: '0.375rem',
                outline: 'none',
                color: '#000000',
                caretColor: '#000000'
              }}
            />
          </div>

          <div style={{ marginBottom: '1.5rem' }}>
            <label
              htmlFor="roomId"
              style={{ display: 'block', fontSize: '0.875rem', fontWeight: '500', color: '#374151', marginBottom: '0.25rem' }}
            >
              Room ID
            </label>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <input
                type="text"
                id="roomId"
                value={roomId}
                onChange={(e) => setRoomId(e.target.value)}
                placeholder="Enter room ID or generate one"
                style={{
                  flex: '1',
                  padding: '0.5rem 0.75rem',
                  border: '1px solid #d1d5db',
                  borderRadius: '0.375rem',
                  outline: 'none',
                  color: '#000000',
                  caretColor: '#000000'
                }}
              />
              <button
                type="button"
                onClick={generateRoomId}
                style={{
                  padding: '0.5rem 0.75rem',
                  backgroundColor: '#958def',
                  color: '#ffffff',
                  borderRadius: '0.375rem',
                  border: 'none',
                  cursor: 'pointer',
                  fontWeight: '500',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '0.875rem',
                  transition: 'background-color 0.2s',
                  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.05)'
                }}
              >
                Generate
              </button>
            </div>
          </div>

          {msg && (
            <div style={{
              marginBottom: '1rem',
              padding: '0.75rem',
              backgroundColor: '#7df4897d',
              color: '#000000',
              fontWeight: '600',
              borderRadius: '0.375rem',
              position: 'absolute',
              top: '10%',
              left: '50%',
              transform: 'translate(-50%, -50%)',
              zIndex: 1000,
            }}>
              {msg}
            </div>
          )}

          <button
            type="submit"
            style={{
              width: '100%',
              padding: '0.5rem 1rem',
              backgroundColor: '#4338ca',
              color: 'white',
              fontWeight: '600',
              borderRadius: '0.375rem',
              border: 'none',
              cursor: 'pointer'
            }}
          >
            Join Room
          </button>
        </form>
      </div>

      <div style={{ marginTop: '2rem', textAlign: 'center', fontSize: '0.875rem', color: '#6b7280', maxWidth: '28rem' }}>
        <p>
          <strong>How it works:</strong> We use WebRTC for direct peer-to-peer
          communication with built-in encryption. No messages are stored
          on any server.
        </p>
      </div>
    </div>
  );
}
