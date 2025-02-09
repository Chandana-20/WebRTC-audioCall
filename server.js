const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Basic route for the home page
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Store active connections
const webrtc_discussions = new Map();
let waitingCallers = new Set();

wss.on('connection', (ws) => {
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

    webrtc_discussions.set(call_token, ws);

    // Send initial role assignment
    ws.send(JSON.stringify({
        type: 'role',
        isCaller: !isCallee,
        call_token: call_token
    }));

    ws.on('message', (message) => {
        try {
            const data = JSON.parse(message);
            // Forward the message to the other peer
            for (const [token, client] of webrtc_discussions.entries()) {
                if (token === call_token && client !== ws) {
                    client.send(message.toString());
                    break;
                }
            }
        } catch (error) {
            console.error('Error processing message:', error);
        }
    });

    ws.on('close', () => {
        waitingCallers.delete(call_token);
        webrtc_discussions.delete(call_token);
    });

    ws.on('error', (error) => {
        console.error('WebSocket error:', error);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});

// Handle server errors
server.on('error', (error) => {
    console.error('Server error:', error);
});

process.on('unhandledRejection', (error) => {
    console.error('Unhandled rejection:', error);
});