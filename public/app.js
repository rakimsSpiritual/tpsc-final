// ========================
// WrtcHelper MODULE (with Xirsys ICE)
// ========================
var WrtcHelper = (function () {
  var _audioTrack, _videoCamSSTrack;
  var peers_conns = [], peers_con_ids = [], _remoteVideoStreams = [], _remoteAudioStreams = [];
  var _localVideoPlayer;
  var _rtpVideoSenders = [], _rtpAudioSenders = [];
  var _serverFn;
  var VideoStates = { None: 0, Camera: 1, ScreenShare: 2 };
  var _videoState = VideoStates.None;
  var _isAudioMute = true;
  var _my_connid = "";

  var iceConfiguration = { iceServers: [] };

  async function _fetchXirsysServers() {
    try {
      const resp = await fetch("https://global.xirsys.net/_turn/Tpsc33", {
        method: "PUT",
        headers: {
          "Authorization": "Basic " + btoa("francis:65a8fdb8-7da3-11f0-98a1-0242ac130003"),
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ format: "urls" })
      });
      const data = await resp.json();
      if (data.v && data.v.iceServers) iceConfiguration.iceServers = data.v.iceServers;
    } catch (e) { console.error("Xirsys ICE fetch error:", e); }
  }

  async function _init(serFn, myconnid) {
    _my_connid = myconnid;
    _serverFn = serFn;
    _localVideoPlayer = document.getElementById("localVideoCtr");
    await _fetchXirsysServers();
    _bindEvents();
  }

  function _bindEvents() {
    $("#btnMuteUnmute").on("click", async function () {
      if (!_audioTrack) await _startAudio();
      if (!_audioTrack) return alert("Audio permission denied");
      _audioTrack.enabled = !_audioTrack.enabled;
      $(this).html(_audioTrack.enabled ? '<span class="material-icons">mic</span>' : '<span class="material-icons">mic_off</span>');
      if (_audioTrack.enabled) _addUpdateSenders(_audioTrack, _rtpAudioSenders);
      else _removeSenders(_rtpAudioSenders);
      _isAudioMute = !_audioTrack.enabled;
    });

    $("#btnStartStopCam").on("click", async function () {
      _videoState === VideoStates.Camera ? _manageVideo(VideoStates.None) : _manageVideo(VideoStates.Camera);
    });

    $("#btnStartStopScreenshare").on("click", async function () {
      _videoState === VideoStates.ScreenShare ? _manageVideo(VideoStates.None) : _manageVideo(VideoStates.ScreenShare);
    });
  }

  async function _manageVideo(newState) {
    if (newState === VideoStates.None) {
      $("#btnStartStopCam").html('<span class="material-icons">videocam_off</span>');
      $("#btnStartStopScreenshare").html('<span class="material-icons">present_to_all</span>');
      _videoState = newState;
      _clearVideoStream(_rtpVideoSenders);
      return;
    }

    try {
      let vstream = null;
      if (newState === VideoStates.Camera) vstream = await navigator.mediaDevices.getUserMedia({ video: { width: 1920, height: 1080 }, audio: false });
      if (newState === VideoStates.ScreenShare) {
        vstream = await navigator.mediaDevices.getDisplayMedia({ video: { width: 1920, height: 1080 }, audio: false });
        vstream.oninactive = () => _clearVideoStream(_rtpVideoSenders);
      }

      _clearVideoStream(_rtpVideoSenders);
      _videoState = newState;
      if (vstream && vstream.getVideoTracks().length) {
        _videoCamSSTrack = vstream.getVideoTracks()[0];
        _localVideoPlayer.srcObject = new MediaStream([_videoCamSSTrack]);
        _addUpdateSenders(_videoCamSSTrack, _rtpVideoSenders);
      }
    } catch (e) { console.log(e); }
  }

  function _clearVideoStream(rtpVideoSenders) {
    if (_videoCamSSTrack) {
      _videoCamSSTrack.stop();
      _videoCamSSTrack = null;
      _localVideoPlayer.srcObject = null;
      _removeSenders(rtpVideoSenders);
    }
  }

  async function _startAudio() {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      _audioTrack = stream.getAudioTracks()[0];
      _audioTrack.enabled = false;
    } catch (e) { console.log(e); }
  }

  async function _createConnection(connid) {
    const conn = new RTCPeerConnection(iceConfiguration);

    conn.onicecandidate = (event) => { if (event.candidate) _serverFn(JSON.stringify({ iceCandidate: event.candidate }), connid); };
    conn.onnegotiationneeded = async () => _createOffer(connid);

    conn.ontrack = (event) => {
      if (!_remoteVideoStreams[connid]) _remoteVideoStreams[connid] = new MediaStream();
      if (!_remoteAudioStreams[connid]) _remoteAudioStreams[connid] = new MediaStream();

      if (event.track.kind === "video") {
        _remoteVideoStreams[connid].getTracks().forEach(t => _remoteVideoStreams[connid].removeTrack(t));
        _remoteVideoStreams[connid].addTrack(event.track);
        document.getElementById("v_" + connid).srcObject = _remoteVideoStreams[connid];
      } else {
        _remoteAudioStreams[connid].getTracks().forEach(t => _remoteAudioStreams[connid].removeTrack(t));
        _remoteAudioStreams[connid].addTrack(event.track);
        document.getElementById("a_" + connid).srcObject = _remoteAudioStreams[connid];
      }
    };

    peers_con_ids[connid] = connid;
    peers_conns[connid] = conn;

    if (_videoState !== VideoStates.None && _videoCamSSTrack) _addUpdateSenders(_videoCamSSTrack, _rtpVideoSenders);

    return conn;
  }

  async function _createOffer(connid) {
    const conn = peers_conns[connid];
    const offer = await conn.createOffer();
    await conn.setLocalDescription(offer);
    _serverFn(JSON.stringify({ offer: conn.localDescription }), connid);
  }

  async function _exchangeSDP(message, from_connid) {
    message = JSON.parse(message);
    if (message.answer) await peers_conns[from_connid].setRemoteDescription(new RTCSessionDescription(message.answer));
    else if (message.offer) {
      if (!peers_conns[from_connid]) await _createConnection(from_connid);
      await peers_conns[from_connid].setRemoteDescription(new RTCSessionDescription(message.offer));
      const answer = await peers_conns[from_connid].createAnswer();
      await peers_conns[from_connid].setLocalDescription(answer);
      _serverFn(JSON.stringify({ answer }), from_connid, _my_connid);
    } else if (message.iceCandidate) {
      if (!peers_conns[from_connid]) await _createConnection(from_connid);
      await peers_conns[from_connid].addIceCandidate(message.iceCandidate).catch(console.error);
    }
  }

  function _addUpdateSenders(track, rtpSenders) {
    peers_con_ids.forEach((id) => {
      if (peers_conns[id]) {
        if (rtpSenders[id]) rtpSenders[id].replaceTrack(track);
        else rtpSenders[id] = peers_conns[id].addTrack(track);
      }
    });
  }

  function _removeSenders(rtpSenders) {
    peers_con_ids.forEach((id) => {
      if (rtpSenders[id] && peers_conns[id]) peers_conns[id].removeTrack(rtpSenders[id]);
      rtpSenders[id] = null;
    });
  }

  function closeConnection(connid) {
    peers_con_ids[connid] = null;
    if (peers_conns[connid]) peers_conns[connid].close();
    peers_conns[connid] = null;
    if (_remoteAudioStreams[connid]) _remoteAudioStreams[connid].getTracks().forEach(t => t.stop());
    if (_remoteVideoStreams[connid]) _remoteVideoStreams[connid].getTracks().forEach(t => t.stop());
    _remoteAudioStreams[connid] = null;
    _remoteVideoStreams[connid] = null;
  }

  return {
    init: async (fn, id) => _init(fn, id),
    ExecuteClientFn: async (data, from_connid) => _exchangeSDP(data, from_connid),
    createNewConnection: async (id) => _createConnection(id),
    closeExistingConnection: closeConnection,
    _audioTrack,
    _videoCamSSTrack
  };
})();

// ========================
// MyApp + HostControls (kept intact)
// ========================
// ... (Use previously merged MyApp + HostControls code) ...

$(document).ready(async function () {
  const userId = new URLSearchParams(window.location.search).get("uid");
  const meetingId = new URLSearchParams(window.location.search).get("meetingID");
  const hostId = "teacher001"; // dynamic per branch
  await MyApp._init(userId, meetingId);
  HostControls.init(userId, hostId);
  HostControls.listenForHostCommands();
});
