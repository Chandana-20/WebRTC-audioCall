const SERVER_URL = window.location.origin;
let peerConnection = null;
let localStream = null;
let socket = null;
let isCaller = false;
let candidateBuffer = [];
let connectionAttempts = 0;
const MAX_ATTEMPTS = 3;

const configuration = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        {
            urls: 'turn:numb.viagenie.ca',
            username: 'webrtc@live.com',
            credential: 'muazkh'
        }
    ],
    iceCandidatePoolSize: 10,
    iceTransportPolicy: 'all'
};

function connect() {
    socket = io(SERVER_URL, {
        reconnection: true,
        reconnectionDelay: 1000,
        reconnectionDelayMax: 5000,
        reconnectionAttempts: MAX_ATTEMPTS,
        transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
        console.log('Connected to signaling server with ID:', socket.id);
        document.getElementById('status').textContent = 'Connected to server, waiting for role assignment...';
    });

    socket.on('connect_error', (error) => {
        console.error('Connection error:', error);
        document.getElementById('status').textContent = 
            `Connection error (Attempt ${++connectionAttempts}/${MAX_ATTEMPTS})`;
    });

    socket.on('role', async (data) => {
        console.log('Received role assignment:', data);
        isCaller = data.isCaller;
        document.getElementById('status').textContent = 
            isCaller ? 'Waiting for someone to join...' : 'Connecting to call...';
        if (!isCaller) await setupCall();
    });

    socket.on('paired', async () => {
        console.log('Paired with peer, initiating connection...');
        document.getElementById('status').textContent = 'Paired with peer, establishing connection...';
        if (isCaller) await setupCall();
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
        localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        document.getElementById('muteButton').disabled = false;
        document.getElementById('hangupButton').disabled = false;

        peerConnection = new RTCPeerConnection(configuration);

        localStream.getTracks().forEach(track => {
            peerConnection.addTrack(track, localStream);
        });

        peerConnection.ontrack = (event) => {
            console.log('Received remote track');
            const remoteAudio = document.getElementById('remoteAudio');
            if (event.streams?.[0]) remoteAudio.srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                console.log('New ICE candidate:', event.candidate.type);
                socket.emit('candidate', event.candidate);
            }
        };

        peerConnection.oniceconnectionstatechange = () => {
            console.log('ICE Connection State:', peerConnection.iceConnectionState);
            document.getElementById('status').textContent = 
                `ICE Connection: ${peerConnection.iceConnectionState}`;
            
            if (peerConnection.iceConnectionState === 'failed') {
                console.log('Attempting ICE restart...');
                restartIce();
            }
        };

        if (isCaller) {
            const offer = await peerConnection.createOffer({
                offerToReceiveAudio: true,
                iceRestart: true
            });
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer);
        }
    } catch (error) {
        console.error('Setup error:', error);
        document.getElementById('status').textContent = 'Error: ' + error.message;
    }
}

async function restartIce() {
    if (peerConnection && isCaller) {
        try {
            const offer = await peerConnection.createOffer({ iceRestart: true });
            await peerConnection.setLocalDescription(offer);
            socket.emit('offer', offer);
        } catch (error) {
            console.error('ICE restart failed:', error);
        }
    }
}

async function handleOffer(offer) {
    try {
        console.log('Received offer, setting remote description');
        await peerConnection.setRemoteDescription(new RTCSessionDescription(offer));
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('answer', answer);
    } catch (error) {
        console.error('Offer handling error:', error);
    }
}

async function handleAnswer(answer) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
    } catch (error) {
        console.error('Answer handling error:', error);
    }
}

async function handleCandidate(candidate) {
    try {
        if (peerConnection?.remoteDescription) {
            await peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
        } else {
            candidateBuffer.push(candidate);
        }
    } catch (error) {
        console.error('Candidate handling error:', error);
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
    document.getElementById('muteButton').disabled = true;
    document.getElementById('hangupButton').disabled = true;
    document.getElementById('status').textContent = 'Call ended. Refresh to start a new call.';
}

connect();