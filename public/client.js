// File: public/client.js
let peerConnection;
let localStream;
let ws;
let isCaller = false;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    ws = new WebSocket(wsUrl);

    ws.onmessage = async (event) => {
        const data = JSON.parse(event.data);

        if (data.type === 'role') {
            isCaller = data.isCaller;
            document.getElementById('status').textContent = 
                isCaller ? 'Waiting for someone to join...' : 'Connecting to call...';
            await setupCall();
        } else if (data.type === 'offer') {
            await handleOffer(data);
        } else if (data.type === 'answer') {
            await handleAnswer(data);
        } else if (data.type === 'candidate') {
            await handleCandidate(data);
        }
    };

    ws.onerror = (error) => {
        console.error('WebSocket error:', error);
        document.getElementById('status').textContent = 'Connection error. Please refresh.';
    };
}

async function setupCall() {
    try {
        // Check if mediaDevices is supported
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('MediaDevices API not supported in this browser');
        }

        // Request audio access
        localStream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: false
        });

        document.getElementById('muteButton').disabled = false;
        document.getElementById('hangupButton').disabled = false;

        peerConnection = new RTCPeerConnection(configuration);
        
        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            const remoteAudio = document.getElementById('remoteAudio');
            if (event.streams && event.streams[0]) {
                remoteAudio.srcObject = event.streams[0];
            }
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate
                }));
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            document.getElementById('status').textContent = 
                `Connection state: ${peerConnection.iceConnectionState}`;
        };

        if (isCaller) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            ws.send(JSON.stringify({
                type: 'offer',
                offer: offer
            }));
        }
    } catch (error) {
        console.error('Error setting up call:', error);
        document.getElementById('status').textContent = 
            'Error setting up call: ' + error.message;
        
        // Re-enable buttons in case of error
        document.getElementById('muteButton').disabled = true;
        document.getElementById('hangupButton').disabled = false;
    }
}

async function handleOffer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        ws.send(JSON.stringify({
            type: 'answer',
            answer: answer
        }));
    } catch (error) {
        console.error('Error handling offer:', error);
        document.getElementById('status').textContent = 
            'Error connecting to peer: ' + error.message;
    }
}

async function handleAnswer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (error) {
        console.error('Error handling answer:', error);
        document.getElementById('status').textContent = 
            'Error connecting to peer: ' + error.message;
    }
}

async function handleCandidate(data) {
    try {
        if (data.candidate) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    } catch (error) {
        console.error('Error handling candidate:', error);
    }
}

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

function hangup() {
    if (peerConnection) {
        peerConnection.close();
    }
    if (localStream) {
        localStream.getTracks().forEach(track => track.stop());
    }
    if (ws) {
        ws.close();
    }
    
    // Reset UI
    document.getElementById('muteButton').disabled = true;
    document.getElementById('status').textContent = 'Call ended. Refresh to start a new call.';
    
    // Optional: reload the page after a short delay
    setTimeout(() => {
        window.location.reload();
    }, 2000);
}

// Start connection when page loads
connect();