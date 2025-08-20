// Connect to server
const socket = io();

// Global variables
let localStream;
let peers = {};
let userIDGlobal;
let meetingIDGlobal;
let mediaRecorder;
let recordedBlobs = [];

// Main function
function MyApp(userID, meetingID) {
    userIDGlobal = userID;
    meetingIDGlobal = meetingID;

    // Get local media
    navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
        localStream = stream;

        const localVideo = document.getElementById('localVideoCtr');
        localVideo.srcObject = stream;

        // Notify server
        socket.emit('joinMeeting', { meetingID, userID });

        // Handle new users
        socket.on('userJoined', ({ userID: newUserID }) => {
            if (newUserID !== userID) {
                createOffer(newUserID);
            }
        });

        // Handle signal data
        socket.on('signal', async ({ from, data }) => {
            if (!peers[from]) {
                await createPeerConnection(from, false);
            }
            peers[from].pc.signal(data);
        });

        // Handle existing participants
        socket.on('existingParticipants', participants => {
            participants.forEach(async participantID => {
                if (participantID !== userID) {
                    await createOffer(participantID);
                }
            });
        });

        // Handle chat messages
        socket.on('newMessage', ({ user, message }) => {
            const msgDiv = document.createElement('div');
            msgDiv.textContent = `${user}: ${message}`;
            document.getElementById('messages').appendChild(msgDiv);
            document.getElementById('messages').scrollTop = document.getElementById('messages').scrollHeight;
        });
    })
    .catch(err => {
        console.error('Error accessing media devices.', err);
        alert("Could not access camera/mic. Please allow permissions.");
    });
}

// --- WebRTC helpers ---
async function createPeerConnection(peerID, isInitiator) {
    const pc = new SimplePeer({
        initiator: isInitiator,
        trickle: false,
        stream: localStream
    });

    pc.on('signal', data => {
        socket.emit('signal', { to: peerID, from: userIDGlobal, data });
    });

    pc.on('stream', remoteStream => {
        addRemoteVideo(peerID, remoteStream);
    });

    pc.on('close', () => {
        removeRemoteVideo(peerID);
    });

    peers[peerID] = { pc };
    return pc;
}

async function createOffer(peerID) {
    const pc = await createPeerConnection(peerID, true);
}

// Add remote video dynamically
function addRemoteVideo(peerID, stream) {
    let remoteTemplate = document.getElementById('remoteTemplate');
    let clone = remoteTemplate.cloneNode(true);
    clone.style.display = 'block';
    clone.id = 'remote_' + peerID;
    clone.querySelector('h5').textContent = peerID;
    clone.querySelector('video').srcObject = stream;
    clone.querySelector('video').muted = false;
    document.getElementById('divUsers').appendChild(clone);

    updateParticipantsList();
}

// Remove remote video
function removeRemoteVideo(peerID) {
    let remoteDiv = document.getElementById('remote_' + peerID);
    if (remoteDiv) remoteDiv.remove();
    delete peers[peerID];
    updateParticipantsList();
}

// Update participant sidebar
function updateParticipantsList() {
    const list = document.getElementById('participantsList');
    list.innerHTML = '';
    list.appendChild(createParticipantLi(userIDGlobal));
    Object.keys(peers).forEach(pid => {
        list.appendChild(createParticipantLi(pid));
    });
}

function createParticipantLi(user) {
    const li = document.createElement('li');
    li.classList.add('list-group-item');
    li.textContent = user;
    return li;
}

// --- Chat ---
$('#btnSendMsg').on('click', () => {
    const msg = $('#msgbox').val().trim();
    if (msg !== '') {
        socket.emit('sendMessage', { meetingID: meetingIDGlobal, user: userIDGlobal, message: msg });
        $('#msgbox').val('');
    }
});

// --- Recording ---
$('#start-recording').on('click', startRecording);
$('#download-video').on('click', downloadRecording);

function startRecording() {
    if (!localStream) return alert("No local stream to record");

    recordedBlobs = [];
    try {
        mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm;codecs=vp9,opus' });
    } catch (e) {
        console.error(e);
        mediaRecorder = new MediaRecorder(localStream, { mimeType: 'video/webm' });
    }

    mediaRecorder.ondataavailable = e => {
        if (e.data && e.data.size > 0) recordedBlobs.push(e.data);
    };

    mediaRecorder.start();
    $('#start-recording').text('Stop Recording');
    $('#start-recording').off('click').on('click', stopRecording);
    $('#download-video').prop('disabled', true);
}

function stopRecording() {
    mediaRecorder.stop();
    $('#start-recording').text('Start Recording');
    $('#start-recording').off('click').on('click', startRecording);
    $('#download-video').prop('disabled', false);
}

function downloadRecording() {
    const blob = new Blob(recordedBlobs, { type: 'video/webm' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = 'recording.webm';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
        document.body.removeChild(a);
        window.URL.revokeObjectURL(url);
    }, 100);
}
