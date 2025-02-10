let peerConnection;
let localStream;
let socket;
let isCaller = false;
let candidateBuffer = [];

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' }  // Added backup STUN server
    ]
};

function connect() {
    socket = io();

    socket.on('role', async (data) => {
        isCaller = data.isCaller;
        document.getElementById('status').textContent = 
            isCaller ? 'Waiting for someone to join...' : 'Connecting to call...';
        
        // Only set up the call immediately if we're the callee
        if (!isCaller) {
            await setupCall();
        }
    });

    // New event for when peers are paired
    socket.on('paired', async () => {
        document.getElementById('status').textContent = 'Paired with peer, establishing connection...';
        if (isCaller) {
            await setupCall();
        }
    });

    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('candidate', handleCandidate);
    socket.on('peerDisconnected', () => {
        document.getElementById('status').textContent = 'Peer disconnected. Refresh to start a new call.';
        hangup();
    });
}

// Rest of the client.js remains the same...