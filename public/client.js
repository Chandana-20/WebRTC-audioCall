// Configuration and state variables
const SERVER_URL = window.location.origin;
let peerConnection = null;
let localStream = null;
let socket = null;
let isCaller = false;
let candidateBuffer = [];
let connectionAttempts = 0;
const MAX_ATTEMPTS = 3;

// WebRTC configuration with multiple STUN servers for better connectivity
const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' }
    ]
};

// Initialize the connection to the signaling server
function connect() {
    // Initialize Socket.IO with reconnection options
    socket = io(SERVER_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: MAX_ATTEMPTS,
        transports: ['websocket', 'polling']
    });

    // Socket connection event handlers
    socket.on('connect', () => {
        console.log('Connected to signaling server with ID:', socket.id);
        document.getElementById('status').textContent = 'Connected to server, waiting for role assignment...';
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        connectionAttempts++;
        document.getElementById('status').textContent = 
            `Connection error (Attempt ${connectionAttempts}/${MAX_ATTEMPTS}): ${error.message}`;
    });

    socket.on('disconnect', (reason) => {
        console.log('Disconnected from server:', reason);
        document.getElementById('status').textContent = 'Disconnected from server. Attempting to reconnect...';
    });

    // WebRTC signaling event handlers
    socket.on('role', async (data) => {
        console.log('Received role assignment:', data);
        isCaller = data.isCaller;
        document.getElementById('status').textContent = 
            isCaller ? 'Waiting for someone to join...' : 'Connecting to call...';
        
        // Only setup call immediately if we're the callee
        if (!isCaller) {
            await setupCall();
        }
    });

    socket.on('paired', async () => {
        console.log('Paired with peer, initiating connection...');
        document.getElementById('status').textContent = 'Paired with peer, establishing connection...';
        if (isCaller) {
            await setupCall();
        }
    });

    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('candidate', handleCandidate);
    socket.on('peerDisconnected', handlePeerDisconnect);
}

// Check if audio devices are available
async function checkMediaDevices() {
    try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(device => device.kind === 'audioinput');
        console.log('Available audio input devices:', audioInputs);
        return audioInputs.length > 0;
    } catch (error) {
        console.error('Error checking media devices:', error);
        return false;
    }
}

// Set up the WebRTC connection
async function setupCall() {
    try {
        // Check for audio devices first
        const hasAudioDevices = await checkMediaDevices();
        if (!hasAudioDevices) {
            throw new Error('No audio input devices found');
        }

        // Request audio access
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });

        // Enable UI controls
        document.getElementById('muteButton').disabled = false;
        document.getElementById('hangupButton').disabled = false;

        // Create and configure the peer connection
        peerConnection = new RTCPeerConnection(configuration);

        // Add local audio tracks to the connection
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        // Handle incoming audio stream
        peerConnection.ontrack = (event) => {
            console.log('Received remote track');
            const remoteAudio = document.getElementById('remoteAudio');
            if (event.streams && event.streams[0]) {
                remoteAudio.srcObject = event.streams[0];
            }
        };

        // Handle ICE candidates
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                socket.emit('candidate', event.candidate);
            }
        };

        // Monitor connection state changes
        peerConnection.onconnectionstatechange = () => {
            console.log('Connection state:', peerConnection.connectionState);
            document.getElementById('status').textContent = 
                `Connection state: ${peerConnection.connectionState}`;
            
            if (peerConnection.connectionState === 'connected') {
                // Process any buffered ICE candidates
                processCandidateBuffer();
            }
        };

        // If we're the caller, create and send the offer
        if (isCaller) {
            console.log('Creating offer as caller');
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer);
        }
    } catch (error) {
        console.error('Error in setupCall:', error);
        document.getElementById('status').textContent = 
            'Error setting up call: ' + error.message;
    }
}

// Process any buffered ICE candidates
async function processCandidateBuffer() {
    console.log('Processing candidate buffer:', candidateBuffer.length, 'candidates');
    while (candidateBuffer.length > 0) {
        const candidate = candidateBuffer.shift();
        try {
            await peerConnection.addIceCandidate(candidate);
        } catch (error) {
            console.error('Error adding buffered candidate:', error);
        }
    }
}

// Handle incoming WebRTC offer
async function handleOffer(offer) {
    try {
        console.log('Received offer, setting remote description');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
    } catch (error) {
        console.error('Error handling offer:', error);
        document.getElementById('status').textContent = 'Error handling offer: ' + error.message;
    }
}

// Handle incoming WebRTC answer
async function handleAnswer(answer) {
    try {
        console.log('Received answer, setting remote description');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling answer:', error);
        document.getElementById('status').textContent = 'Error handling answer: ' + error.message;
    }
}

// Handle incoming ICE candidates
async function handleCandidate(candidate) {
    try {
        if (peerConnection && peerConnection.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            // Buffer the candidate if connection isn't ready
            candidateBuffer.push(candidate);
        }
    } catch (error) {
        console.error('Error handling ICE candidate:', error);
    }
}

// Handle peer disconnection
function handlePeerDisconnect() {
    document.getElementById('status').textContent = 'Peer disconnected. Refresh to start a new call.';
    hangup();
}

// Toggle audio mute state
function toggleMute() {
    if (localStream) {
        const audioTrack = localStream.getAudioTracks()[0];
        if (audioTrack) {
            audioTrack.enabled = !audioTrack.enabled;
            document.getElementById('muteButton').textContent = 
                audioTrack.enabled ? 'Mute' : 'Unmute';
        }
    }
}

// Clean up and end the call
function hangup() {
    console.log('Ending call');
    
    if (peerConnection) {
        peerConnection.close();
        peerConnection = null;
    }
    
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
        localStream = null;
    }
    
    if (socket) {
        socket.close();
        socket = null;
    }
    
    // Reset UI
    document.getElementById('muteButton').disabled = true;
    document.getElementById('hangupButton').disabled = true;
    document.getElementById('status').textContent = 'Call ended. Refresh to start a new call.';
}

// Start everything when the page loads
connect();