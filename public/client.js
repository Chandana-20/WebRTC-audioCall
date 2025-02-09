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
            document.getElementById('remoteAudio').srcObject = event.streams[0];
        };

        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                ws.send(JSON.stringify({
                    type: 'candidate',
                    candidate: event.candidate
                }));
            }
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
        document.getElementById('status').textContent = 'Error setting up call: ' + error.message;
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
    }
}

async function handleAnswer(data) {
    try {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
    } catch (error) {
        console.error('Error handling answer:', error);
    }
}

async function handleCandidate(data) {
    try {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch (error) {
        console.error('Error handling candidate:', error);
    }
}

function toggleMute() {
    const audioTrack = localStream.getAudioTracks()[0];
    audioTrack.enabled = !audioTrack.enabled;
    document.getElementById('muteButton').textContent = 
        audioTrack.enabled ? 'Mute' : 'Unmute';
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
    window.location.reload();
}

// Start connection when page loads
connect();