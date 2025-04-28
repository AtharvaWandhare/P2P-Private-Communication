# P2P Private Communication System

A secure, private, and decentralized real-time chat application that allows two users to communicate directly via WebRTC DataChannels, with no server storing any message data.

## Features

- **End-to-End Encryption**: All messages are encrypted using WebRTC's built-in DTLS-SRTP encryption
- **No Message Storage**: Messages exist only on your devices, never stored on any server
- **No Login Required**: Just enter a nickname and room ID to start chatting
- **Direct Peer-to-Peer**: After the initial connection setup, all messages flow directly between peers
- **Responsive UI**: Works well on both desktop and mobile devices

## Tech Stack

### Frontend
- Next.js with TypeScript and React
- Tailwind CSS for styling
- WebRTC for peer-to-peer communication

### Backend (Signaling Server)
- Spring Boot
- WebSocket with STOMP for signaling

## How It Works

1. **Room Creation**: Users generate or enter a room ID and provide a nickname
2. **Signaling**: Both peers connect to the signaling server to exchange connection information
3. **WebRTC Negotiation**:
   - Exchange of SDP (Session Description Protocol) for media capabilities
   - Exchange of ICE candidates for network connectivity
4. **Direct Connection**: Once established, a secure peer-to-peer connection handles all messages
5. **Encrypted Communication**: WebRTC's built-in DTLS-SRTP ensures all messages are encrypted

## Getting Started

### Prerequisites
- Node.js (v18+ recommended)
- Java 17+ (for the signaling server)
- Maven

### Running the Frontend

```bash
cd client
npm install
npm run dev
```

The client will be available at http://localhost:3000

### Running the Backend

```bash
cd server
mvn spring-boot:run
```

The signaling server will be available at http://localhost:8080

## Testing

For testing purposes, you can open the app in two different browser tabs or windows. Enter the same room ID in both tabs but use different nicknames to simulate two users communicating.

## Security Notes

- All message data is transmitted directly between peers with WebRTC's encryption
- The signaling server never sees or stores any message content
- Only connection negotiation information passes through the server
- For even higher security, consider running the signaling server on your own infrastructure

## License

MIT

## Acknowledgments

- WebRTC technology makes direct peer-to-peer communication possible
- Spring Boot provides a robust platform for the signaling server
- Next.js offers an excellent frontend development experience 