const express = require('express');
const app = express();
const http = require('http').createServer(app);
const io = require('socket.io')(http);
const path = require('path');

app.use(express.static(path.join(__dirname, 'public')));

// Store active connections
const webrtc_rooms = new Map(); // Map to store room information
let waitingCallers = new Set();

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    let isCaller = true;
    let roomId;

    // Check if there's an available caller
    if (waitingCallers.size > 0) {
        // Get the first waiting caller's room
        roomId = [...waitingCallers][0];
        waitingCallers.delete(roomId);
        isCaller = false; // This user is a callee
        
        // Add this socket to the room
        const room = webrtc_rooms.get(roomId);
        if (room) {
            room.callee = socket;
            // Notify both parties that they're now paired
            room.caller.emit('paired');
            socket.emit('paired');
        }
    } else {
        // Create a new room for the caller
        roomId = Date.now().toString();
        waitingCallers.add(roomId);
        webrtc_rooms.set(roomId, {
            caller: socket,
            callee: null
        });
    }

    // Store the room ID on the socket for easy reference
    socket.roomId = roomId;

    // Notify the client of their role
    socket.emit('role', { isCaller, roomId });

    // Handle WebRTC signaling
    socket.on('offer', (data) => {
        const room = webrtc_rooms.get(socket.roomId);
        if (room && room.callee) {
            room.callee.emit('offer', data);
        }
    });

    socket.on('answer', (data) => {
        const room = webrtc_rooms.get(socket.roomId);
        if (room && room.caller) {
            room.caller.emit('answer', data);
        }
    });

    socket.on('candidate', (data) => {
        const room = webrtc_rooms.get(socket.roomId);
        if (room) {
            const peer = socket === room.caller ? room.callee : room.caller;
            if (peer) {
                peer.emit('candidate', data);
            }
        }
    });

    // Handle disconnections
    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
        const roomId = socket.roomId;
        
        if (roomId) {
            // Remove from waiting callers if they were waiting
            waitingCallers.delete(roomId);
            
            // Notify peer and cleanup room
            const room = webrtc_rooms.get(roomId);
            if (room) {
                const peer = socket === room.caller ? room.callee : room.caller;
                if (peer) {
                    peer.emit('peerDisconnected');
                }
                webrtc_rooms.delete(roomId);
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
http.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});