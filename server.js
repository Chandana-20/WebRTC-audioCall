const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Store active connections
const webrtc_discussions = new Map();
let waitingCallers = new Set();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    let isCaller = true;
    let call_token;

    // Check if there's an available caller
    if (waitingCallers.size > 0) {
        // Assign to the first available caller
        call_token = [...waitingCallers][0];
        waitingCallers.delete(call_token);
        isCaller = false; // This user is a callee
    } else {
        // Create a new session for the caller
        call_token = Date.now().toString();
        waitingCallers.add(call_token);
    }

    // Store the socket in discussions
    webrtc_discussions.set(call_token, socket);

    // Notify the client of their role
    socket.emit('role', { isCaller, call_token });

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        const peer = webrtc_discussions.get(call_token);
        if (peer && peer !== socket) {
            peer.emit('offer', data);
        }
    });

    socket.on('answer', (data) => {
        const peer = webrtc_discussions.get(call_token);
        if (peer && peer !== socket) {
            peer.emit('answer', data);
        }
    });

    socket.on('candidate', (data) => {
        const peer = webrtc_discussions.get(call_token);
        if (peer && peer !== socket) {
            peer.emit('candidate', data);
        }
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        waitingCallers.delete(call_token);
        webrtc_discussions.delete(call_token);

        // Notify the peer of disconnection
        const peer = webrtc_discussions.get(call_token);
        if (peer) {
            peer.emit('peerDisconnected');
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
