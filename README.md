# WebRTC Audio Call Application

This project is a **WebRTC-based audio call application** that enables peer-to-peer audio communication between devices. It leverages **WebRTC** for real-time communication and **Socket.IO** for signaling.

## Features
- Establishes **peer-to-peer audio calls** using WebRTC.
- Supports multiple **STUN** and **TURN** servers for enhanced connectivity.
- Provides a **simple UI** for connecting, muting/unmuting audio, and ending calls.
- Automatically handles ICE candidates for seamless connection setup.
- Displays connection and signaling statuses for better feedback.
- Robust error handling and reconnection logic.

## Technologies Used
- **WebRTC**: Real-time communication.
- **Socket.IO**: Signaling for WebRTC connections.
- **HTML, CSS, JavaScript**: Front-end development.

## How It Works
1. Users connect to a **signaling server** (via Socket.IO).
2. The server assigns roles (caller or callee) and pairs peers.
3. **SDP exchange** and ICE candidate handling establish a WebRTC connection.
4. Users can start calls, mute/unmute audio, and hang up.

## Getting Started

### Prerequisites
- [Node.js](https://nodejs.org/) installed on your system.

### Installation
1. Clone the repository:
   ```bash
   git clone https://github.com/<your-username>/<your-repo>.git
   cd <your-repo>
