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
    
    const isCallee = waitingCallers.size > 0;
    let call_token;

    if (isCallee && waitingCallers.size > 0) {
        // Find an available caller
        for (const caller_token of waitingCallers) {
            if (webrtc_discussions.has(caller_token)) {
                call_token = caller_token;
                waitingCallers.delete(caller_token);
                break;
            }
        }
    } else {
        // Create new caller session
        call_token = Date.now().toString();
        waitingCallers.add(call_token);
    }

    webrtc_discussions.set(call_token, socket);

    // Send initial role assignment
    socket.emit('role', {
        isCaller: !isCallee,
        call_token: call_token
    });

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        for (const [token, peer] of webrtc_discussions.entries()) {
            if (token === call_token && peer !== socket) {
                peer.emit('offer', data);
                break;
            }
        }
    });

    socket.on('answer', (data) => {
        for (const [token, peer] of webrtc_discussions.entries()) {
            if (token === call_token && peer !== socket) {
                peer.emit('answer', data);
                break;
            }
        }
    });

    socket.on('candidate', (data) => {
        for (const [token, peer] of webrtc_discussions.entries()) {
            if (token === call_token && peer !== socket) {
                peer.emit('candidate', data);
                break;
            }
        }
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        waitingCallers.delete(call_token);
        webrtc_discussions.delete(call_token);
        
        // Notify peers about disconnection
        for (const [token, peer] of webrtc_discussions.entries()) {
            if (token === call_token && peer !== socket) {
                peer.emit('peerDisconnected');
                break;
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});