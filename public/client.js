let peerConnection;
let localStream;
let socket;
let isCaller = false;
let candidateBuffer = []; // Buffer for ICE candidates

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' }
    ]
};

function connect() {
    // Connect to signaling server
    socket = io();

    socket.on('role', async (data) => {
        isCaller = data.isCaller;
        document.getElementById('status').textContent = 
            isCaller ? 'Waiting for someone to join...' : 'Connecting to call...';
        await setupCall();
    });

    socket.on('offer', handleOffer);
    socket.on('answer', handleAnswer);
    socket.on('candidate', handleCandidate);
    socket.on('peerDisconnected', () => {
        document.getElementById('status').textContent = 'Peer disconnected. Refresh to start a new call.';
        hangup();
    });
}

async function setupCall() {
    try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error('MediaDevices API not supported in this browser');
        }

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
                socket.emit('candidate', event.candidate);
            }
        };

        peerConnection.onconnectionstatechange = () => {
            document.getElementById('status').textContent = 
                `Connection state: ${peerConnection.connectionState}`;
            if (peerConnection.connectionState === 'connected') {
                candidateBuffer.forEach(async (candidate) => {
                    await peerConnection.addIceCandidate(candidate);
                });
                candidateBuffer = [];
            }
        };

        if (isCaller) {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer);
        }
    } catch (error) {
        console.error('Error setting up call:', error);
        document.getElementById('status').textContent = 
            'Error setting up call: ' + error.message;
    }
}

async function handleOffer(offer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
    } catch (error) {
        console.error('Error handling offer:', error);
    }
}

async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

async function handleCandidate(candidate) {
    try {
        if (peerConnection) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            candidateBuffer.push(candidate); // Buffer the candidate if connection is not ready
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
    if (socket) {
        socket.close();
    }
    
    document.getElementById('muteButton').disabled = true;
    document.getElementById('status').textContent = 'Call ended. Refresh to start a new call.';
}

// Start connection when page loads
connect();
