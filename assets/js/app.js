const API_BASE = 'https://remote-link-server.remote-link.workers.dev';
const WS_BASE = 'wss://remote-link-server.remote-link.workers.dev';
const FALLBACK_POLL_INTERVAL_MS = 10000;

const views = [...document.querySelectorAll('.view')];
const installBtn = document.getElementById('installBtn');
const trustedList = document.getElementById('trustedList');
const supportForm = document.getElementById('supportForm');
const codeInput = document.getElementById('sessionCode');
const passwordInput = document.getElementById('sessionPassword');
const formError = document.getElementById('formError');
const connectingText = document.getElementById('connectingText');
const connectSubmitBtn = supportForm.querySelector('button[type="submit"]');
const remoteStage = document.getElementById('remoteStage');
const remoteVideo = document.getElementById('remoteVideo');
const remoteMediaStatus = document.getElementById('remoteMediaStatus');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const mouseControlBtn = document.getElementById('mouseControlBtn');
const screensControlBtn = document.getElementById('screensControlBtn');
const screensModal = document.getElementById('screensModal');
const screensModalClose = document.getElementById('screensModalClose');
const screensList = document.getElementById('screensList');
const diagRelay = document.getElementById('diagRelay');
const diagSignaling = document.getElementById('diagSignaling');
const diagIceGathering = document.getElementById('diagIceGathering');
const diagIceConnection = document.getElementById('diagIceConnection');
const diagPeer = document.getElementById('diagPeer');
const diagTrack = document.getElementById('diagTrack');
const diagLastEvent = document.getElementById('diagLastEvent');

let deferredPrompt = null;

const INSTALL_NUDGE_VISIBLE_MS = 8000;
const INSTALL_SWIPE_DISMISS_PX = 48;
let installHideTimer = null;
let installDragStartX = null;
let installDragStartY = null;
let installDragDeltaX = 0;
let installDragActive = false;
let installSwipeDismissed = false;

function hideInstallNudge({ swiped = false } = {}) {
  if (installHideTimer) {
    clearTimeout(installHideTimer);
    installHideTimer = null;
  }

  if (installBtn.hidden) return;

  installBtn.classList.add(swiped ? 'install-nudge-swiped' : 'install-nudge-hiding');
  window.setTimeout(() => {
    installBtn.hidden = true;
    installBtn.classList.remove('install-nudge-visible', 'install-nudge-hiding', 'install-nudge-swiped');
    installBtn.style.transform = '';
    installBtn.style.opacity = '';
  }, 220);
}

function showInstallNudge() {
  if (!deferredPrompt) return;

  installBtn.hidden = false;
  installBtn.classList.remove('install-nudge-hiding', 'install-nudge-swiped');
  requestAnimationFrame(() => installBtn.classList.add('install-nudge-visible'));

  if (installHideTimer) clearTimeout(installHideTimer);
  installHideTimer = window.setTimeout(() => hideInstallNudge(), INSTALL_NUDGE_VISIBLE_MS);
}

function resetInstallDrag() {
  installDragStartX = null;
  installDragStartY = null;
  installDragDeltaX = 0;
  installDragActive = false;
  installBtn.style.transform = '';
  installBtn.style.opacity = '';
}

function beginInstallDrag(clientX, clientY) {
  installDragStartX = clientX;
  installDragStartY = clientY;
  installDragDeltaX = 0;
  installDragActive = false;
  installSwipeDismissed = false;
}

function moveInstallDrag(clientX, clientY) {
  if (installDragStartX === null || installDragStartY === null) return false;

  const deltaX = clientX - installDragStartX;
  const deltaY = clientY - installDragStartY;

  // Só assume o gesto quando o movimento horizontal fica claramente dominante.
  if (!installDragActive) {
    if (Math.abs(deltaX) < 8) return false;
    if (Math.abs(deltaX) <= Math.abs(deltaY)) return false;
    installDragActive = true;
  }

  installDragDeltaX = deltaX;
  const limited = Math.max(-140, Math.min(140, installDragDeltaX));
  installBtn.style.transform = `translateX(${limited}px)`;
  installBtn.style.opacity = String(Math.max(0.25, 1 - Math.abs(limited) / 165));
  return true;
}

function finishInstallDrag() {
  if (installDragActive && Math.abs(installDragDeltaX) >= INSTALL_SWIPE_DISMISS_PX) {
    installSwipeDismissed = true;
    hideInstallNudge({ swiped: true });
    installDragStartX = null;
    installDragStartY = null;
    installDragDeltaX = 0;
    installDragActive = false;
    return true;
  }

  resetInstallDrag();
  return false;
}
let connectionAttempt = 0;
let sessionSocket = null;
let viewerTokenInMemory = null;
let viewerPeer = null;
let viewerPeerCode = null;
let remoteIceQueue = [];
let localIceQueue = [];
let viewerOfferSent = false;
let viewerWebRtcStarting = false;
let viewerControlChannel = null;
let mouseControlEnabled = false;
let pointerGesture = null;
let lastMouseMoveAt = 0;
let multiTouchScroll = false;
let lastTwoFingerY = null;
let remoteMonitors = [];
let selectedRemoteMonitorIndex = 0;

function setRemoteSessionGuard(enabled) {
  document.documentElement.classList.toggle('remote-session-guard', enabled);
  document.body.classList.toggle('remote-session-guard', enabled);
}

function showView(id) {
  views.forEach(v => v.classList.toggle('active', v.id === id));
  // Protege a tentativa/sessao contra pull-to-refresh acidental no Android.
  // A protecao existe apenas enquanto a conexao esta sendo negociada ou ativa.
  setRemoteSessionGuard(id === 'connectingView' || id === 'sessionView');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

let remotePullStartY = null;

window.addEventListener('touchstart', (event) => {
  if (!document.documentElement.classList.contains('remote-session-guard')) return;
  if (event.touches.length !== 1) return;
  remotePullStartY = event.touches[0].clientY;
}, { passive: true });

window.addEventListener('touchmove', (event) => {
  if (!document.documentElement.classList.contains('remote-session-guard')) return;
  if (remotePullStartY === null || event.touches.length !== 1) return;

  const deltaY = event.touches[0].clientY - remotePullStartY;
  // No topo da pagina, arrastar para baixo e o gesto que dispara o refresh
  // nativo do Chrome Android. Bloqueamos somente esse movimento.
  if (window.scrollY <= 0 && deltaY > 0) {
    event.preventDefault();
  }
}, { passive: false });

window.addEventListener('touchend', () => {
  remotePullStartY = null;
}, { passive: true });

window.addEventListener('touchcancel', () => {
  remotePullStartY = null;
}, { passive: true });

window.addEventListener('beforeunload', (event) => {
  if (!document.documentElement.classList.contains('remote-session-guard')) return;
  event.preventDefault();
  event.returnValue = '';
});

function toast(message) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}

function formatCode(value) {
  const digits = value.replace(/\D/g, '').slice(0, 6);
  return digits.length > 3 ? `${digits.slice(0, 3)} ${digits.slice(3)}` : digits;
}

function normalizeCode(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 6);
}

function setFormError(message = '') {
  formError.textContent = message;
  formError.hidden = !message;
}

async function api(path, options = {}) {
  const response = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });

  let data = null;
  try {
    data = await response.json();
  } catch {
    data = { ok: false, error: 'INVALID_SERVER_RESPONSE' };
  }

  if (!response.ok) {
    const error = new Error(data?.error || `HTTP_${response.status}`);
    error.status = response.status;
    error.data = data;
    throw error;
  }

  return data;
}

function friendlyError(error) {
  const code = error?.data?.error || error?.message;
  switch (code) {
    case 'AUTH_FAILED':
      return 'Código ou senha temporária inválidos.';
    case 'SESSION_NOT_FOUND':
      return 'Sessão não encontrada. Confira o código exibido no computador.';
    case 'SESSION_EXPIRED':
      return 'O código expirou. Peça à pessoa para gerar um novo código.';
    case 'INVALID_CODE':
    case 'INVALID_PASSWORD':
    case 'INVALID_SESSION_DATA':
      return 'Informe um código válido de 6 dígitos e a senha temporária.';
    default:
      return 'Não foi possível conectar ao Remote Link Server. Tente novamente.';
  }
}

function renderTrustedDevices() {
  const devices = JSON.parse(localStorage.getItem('rl_trusted_devices') || '[]');
  if (!devices.length) return;

  trustedList.innerHTML = devices.map(d => `
    <button class="device-card" type="button" data-device-id="${d.id}">
      <span>
        <strong>${d.name}</strong>
        <small>${d.lastSeen || 'Pareado localmente'}</small>
      </span>
      <span>›</span>
    </button>
  `).join('');

  trustedList.querySelectorAll('.device-card').forEach(btn => {
    btn.addEventListener('click', () => {
      toast('Acesso permanente será conectado em uma próxima etapa.');
    });
  });
}

function setDiag(element, value) {
  if (element) element.textContent = String(value ?? '—');
}

function diagEvent(message) {
  const stamp = new Date().toLocaleTimeString('pt-BR', { hour12: false });
  if (diagLastEvent) diagLastEvent.textContent = `${stamp} • ${message}`;
  console.info(`[Remote Link WebRTC ${stamp}] ${message}`);
}

function resetDiagnostics() {
  setDiag(diagRelay, 'aguardando');
  setDiag(diagSignaling, 'stable');
  setDiag(diagIceGathering, 'new');
  setDiag(diagIceConnection, 'new');
  setDiag(diagPeer, 'new');
  setDiag(diagTrack, 'aguardando');
  diagEvent('Diagnóstico reiniciado.');
}

function refreshPeerDiagnostics(pc) {
  if (!pc) return;
  setDiag(diagSignaling, pc.signalingState);
  setDiag(diagIceGathering, pc.iceGatheringState);
  setDiag(diagIceConnection, pc.iceConnectionState);
  setDiag(diagPeer, pc.connectionState);
}

function sendSignal(kind, data = null) {
  if (!sessionSocket || sessionSocket.readyState !== WebSocket.OPEN) return false;
  try {
    sessionSocket.send(JSON.stringify({ type: 'signal', kind, data }));
    return true;
  } catch {
    return false;
  }
}

function setMouseControlEnabled(enabled, { quiet = false } = {}) {
  mouseControlEnabled = Boolean(enabled && viewerControlChannel?.readyState === 'open');
  remoteStage?.classList.toggle('mouse-control-active', mouseControlEnabled);
  mouseControlBtn?.classList.toggle('active', mouseControlEnabled);
  mouseControlBtn?.setAttribute('aria-pressed', mouseControlEnabled ? 'true' : 'false');

  if (mouseControlBtn) {
    const available = viewerControlChannel?.readyState === 'open';
    mouseControlBtn.disabled = !available;
    mouseControlBtn.title = available
      ? (mouseControlEnabled ? 'Mouse — controle ativo' : 'Mouse — ativar controle')
      : 'Mouse — aguardando canal de controle';
  }

  if (!quiet && mouseControlEnabled) toast('Controle do mouse ativado. Toque para clicar, segure para clique direito.');
  if (!quiet && !mouseControlEnabled && viewerControlChannel?.readyState === 'open') toast('Controle do mouse pausado.');
}

function sendControlMessage(message) {
  if (!mouseControlEnabled) return false;
  return sendControlRaw(message);
}

function handleControlChannelMessage(message) {
  if (!message || typeof message !== 'object') return;

  if (message.type === 'monitors' && Array.isArray(message.items)) {
    remoteMonitors = message.items;
    selectedRemoteMonitorIndex = Number.isInteger(message.selectedIndex) ? message.selectedIndex : 0;
    renderRemoteMonitors();
    if (screensControlBtn) {
      screensControlBtn.disabled = remoteMonitors.length === 0;
      screensControlBtn.classList.toggle('active', remoteMonitors.length > 1);
      screensControlBtn.title = remoteMonitors.length > 1
        ? `Telas — ${remoteMonitors.length} monitores disponíveis`
        : 'Tela remota';
    }
    diagEvent(`Agent informou ${remoteMonitors.length} tela(s).`);
    return;
  }

  if (message.type === 'screen-selected' && Number.isInteger(message.index)) {
    selectedRemoteMonitorIndex = message.index;
    renderRemoteMonitors();
    toast(`Tela ${message.index + 1} selecionada.`);
  }
}

function renderRemoteMonitors() {
  if (!screensList) return;
  if (!remoteMonitors.length) {
    screensList.innerHTML = '<p class="screens-help">Nenhuma informação de monitor recebida.</p>';
    return;
  }

  screensList.innerHTML = remoteMonitors.map(monitor => {
    const active = monitor.index === selectedRemoteMonitorIndex;
    return `
      <button class="screen-option${active ? ' active' : ''}" type="button" data-screen-index="${monitor.index}">
        <span>
          <strong>${monitor.name || `Tela ${monitor.index + 1}`}</strong>
          <small>${monitor.width} × ${monitor.height}${monitor.primary ? ' • Principal' : ''}</small>
        </span>
        ${active ? '<span class="screen-badge">Em uso</span>' : ''}
      </button>`;
  }).join('');

  screensList.querySelectorAll('[data-screen-index]').forEach(button => {
    button.addEventListener('click', () => {
      const index = Number(button.dataset.screenIndex);
      if (!Number.isInteger(index)) return;
      if (sendControlRaw({ type: 'screen', action: 'select', index })) {
        selectedRemoteMonitorIndex = index;
        renderRemoteMonitors();
        closeScreensModal();
      }
    });
  });
}

function sendControlRaw(message) {
  if (!viewerControlChannel || viewerControlChannel.readyState !== 'open') return false;
  try {
    viewerControlChannel.send(JSON.stringify(message));
    return true;
  } catch {
    return false;
  }
}

function openScreensModal() {
  if (!screensModal || !remoteMonitors.length) {
    toast('Aguardando informações das telas do computador.');
    sendControlRaw({ type: 'screen', action: 'list' });
    return;
  }
  renderRemoteMonitors();
  screensModal.hidden = false;
  document.body.style.overflow = 'hidden';
  screensModalClose?.focus();
}

function closeScreensModal() {
  if (!screensModal) return;
  screensModal.hidden = true;
  document.body.style.overflow = '';
}

function getRemotePoint(clientX, clientY) {
  if (!remoteVideo || !remoteVideo.videoWidth || !remoteVideo.videoHeight) return null;
  const rect = remoteVideo.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;

  const videoAspect = remoteVideo.videoWidth / remoteVideo.videoHeight;
  const boxAspect = rect.width / rect.height;
  let contentWidth = rect.width;
  let contentHeight = rect.height;
  let offsetX = 0;
  let offsetY = 0;

  if (boxAspect > videoAspect) {
    contentWidth = rect.height * videoAspect;
    offsetX = (rect.width - contentWidth) / 2;
  } else {
    contentHeight = rect.width / videoAspect;
    offsetY = (rect.height - contentHeight) / 2;
  }

  const x = (clientX - rect.left - offsetX) / contentWidth;
  const y = (clientY - rect.top - offsetY) / contentHeight;
  if (x < 0 || x > 1 || y < 0 || y > 1) return null;
  return { x, y };
}

function sendMouseMove(clientX, clientY, force = false) {
  const now = performance.now();
  if (!force && now - lastMouseMoveAt < 33) return;
  const point = getRemotePoint(clientX, clientY);
  if (!point) return;
  lastMouseMoveAt = now;
  sendControlMessage({ type: 'mouse', action: 'move', x: point.x, y: point.y });
}

function resetPointerGesture() {
  pointerGesture = null;
}

function resetRemoteViewer(message = 'Conexão autorizada. Negociando a transmissão da tela via WebRTC...') {
  remoteStage?.classList.remove('media-active');
  if (remoteVideo) {
    try { remoteVideo.pause(); } catch { }
    remoteVideo.srcObject = null;
  }
  if (remoteMediaStatus) remoteMediaStatus.textContent = message;
}

function stopViewerWebRtc({ notifyAgent = false } = {}) {
  if (notifyAgent && viewerPeer) sendSignal('bye', { reason: 'viewer-ended' });

  setMouseControlEnabled(false, { quiet: true });
  if (viewerControlChannel) {
    try { viewerControlChannel.close(); } catch { }
  }
  viewerControlChannel = null;
  remoteMonitors = [];
  selectedRemoteMonitorIndex = 0;
  if (screensControlBtn) screensControlBtn.disabled = true;
  closeScreensModal();
  resetPointerGesture();

  if (viewerPeer) {
    try { viewerPeer.ontrack = null; } catch { }
    try { viewerPeer.onicecandidate = null; } catch { }
    try { viewerPeer.close(); } catch { }
  }

  viewerPeer = null;
  viewerPeerCode = null;
  remoteIceQueue = [];
  localIceQueue = [];
  viewerOfferSent = false;
  viewerWebRtcStarting = false;
  resetRemoteViewer();
}

function closeSessionSocket() {
  stopViewerWebRtc({ notifyAgent: false });
  if (sessionSocket) {
    try { sessionSocket.close(1000, 'Remote Link encerrado'); } catch { }
  }
  sessionSocket = null;
  viewerTokenInMemory = null;
}

function cancelCurrentAttempt() {
  connectionAttempt += 1;
  closeSessionSocket();
}

async function handleViewerSignal(message) {
  if (message?.type !== 'signal') return;

  if (message.kind === 'bye') {
    stopViewerWebRtc({ notifyAgent: false });
    if (remoteMediaStatus) remoteMediaStatus.textContent = 'A transmissão da tela foi encerrada pelo computador remoto.';
    return;
  }

  const pc = viewerPeer;
  if (!pc) return;

  try {
    if (message.kind === 'answer') {
      const answer = message.data;
      if (!answer?.sdp) return;
      diagEvent(`Answer recebido (${answer.sdp.length} caracteres).`);
      await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
      refreshPeerDiagnostics(pc);
      diagEvent('Remote description (answer) aplicada.');

      const pending = remoteIceQueue;
      remoteIceQueue = [];
      for (const candidate of pending) {
        await pc.addIceCandidate(candidate);
      }
      return;
    }

    if (message.kind === 'ice' && message.data?.candidate) {
      diagEvent('ICE remoto recebido.');
      if (pc.remoteDescription) {
        await pc.addIceCandidate(message.data);
        diagEvent('ICE remoto aplicado.');
      } else {
        remoteIceQueue.push(message.data);
        diagEvent('ICE remoto enfileirado aguardando answer.');
      }
    }
  } catch (error) {
    console.warn('Remote Link WebRTC signal error', error);
    if (remoteMediaStatus) remoteMediaStatus.textContent = 'Falha durante a negociação da tela. Tente encerrar e conectar novamente.';
  }
}

async function startViewerWebRtc(code) {
  if (viewerWebRtcStarting || (viewerPeer && viewerPeerCode === code)) return;
  if (!sessionSocket || sessionSocket.readyState !== WebSocket.OPEN) {
    if (remoteMediaStatus) remoteMediaStatus.textContent = 'Canal de sinalização indisponível para iniciar a tela.';
    return;
  }

  viewerWebRtcStarting = true;
  stopViewerWebRtc({ notifyAgent: false });
  viewerWebRtcStarting = true;
  viewerPeerCode = code;
  resetRemoteViewer('Negociando conexão WebRTC com o computador...');
  resetDiagnostics();

  const pc = new RTCPeerConnection({
    iceServers: [
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
  });
  viewerPeer = pc;
  refreshPeerDiagnostics(pc);
  diagEvent('PeerConnection criado com STUN Cloudflare.');

  const controlChannel = pc.createDataChannel('remote-link-control-v1', { ordered: true });
  viewerControlChannel = controlChannel;
  controlChannel.onopen = () => {
    diagEvent('DataChannel de controle do mouse conectado.');
    if (mouseControlBtn) {
      mouseControlBtn.disabled = false;
      mouseControlBtn.title = 'Mouse — ativar controle';
    }
    sendControlRaw({ type: 'screen', action: 'list' });
  };
  controlChannel.onclose = () => {
    diagEvent('DataChannel de controle do mouse encerrado.');
    setMouseControlEnabled(false, { quiet: true });
    if (viewerControlChannel === controlChannel) viewerControlChannel = null;
  };
  controlChannel.onerror = () => {
    diagEvent('Falha no DataChannel de controle do mouse.');
    setMouseControlEnabled(false, { quiet: true });
  };
  controlChannel.onmessage = (event) => {
    try {
      const message = JSON.parse(String(event.data || ''));
      handleControlChannelMessage(message);
    } catch {
      diagEvent('Mensagem auxiliar do Agent ignorada.');
    }
  };

  pc.addTransceiver('video', { direction: 'recvonly' });
  diagEvent('Transceiver de vídeo recvonly criado.');

  pc.ontrack = async (event) => {
    setDiag(diagTrack, `${event.track.kind} recebido`);
    diagEvent(`Track remoto recebido: ${event.track.kind}.`);
    const stream = event.streams?.[0] || new MediaStream([event.track]);
    remoteVideo.srcObject = stream;
    remoteStage?.classList.add('media-active');
    try { await remoteVideo.play(); } catch { }
  };

  pc.onicecandidate = (event) => {
    if (!event.candidate) {
      diagEvent('Coleta de ICE local concluída.');
      refreshPeerDiagnostics(pc);
      return;
    }
    const candidate = event.candidate.toJSON();
    diagEvent(`ICE local gerado: ${event.candidate.type || 'tipo desconhecido'}.`);
    if (viewerOfferSent) {
      sendSignal('ice', candidate);
    } else {
      localIceQueue.push(candidate);
    }
  };

  pc.onsignalingstatechange = () => {
    refreshPeerDiagnostics(pc);
    diagEvent(`Signaling state: ${pc.signalingState}.`);
  };

  pc.onicegatheringstatechange = () => {
    refreshPeerDiagnostics(pc);
    diagEvent(`ICE gathering: ${pc.iceGatheringState}.`);
  };

  pc.oniceconnectionstatechange = () => {
    refreshPeerDiagnostics(pc);
    diagEvent(`ICE connection: ${pc.iceConnectionState}.`);
  };

  pc.onconnectionstatechange = () => {
    refreshPeerDiagnostics(pc);
    diagEvent(`Peer connection: ${pc.connectionState}.`);
    switch (pc.connectionState) {
      case 'connecting':
        if (remoteMediaStatus) remoteMediaStatus.textContent = 'Conectando o canal de vídeo...';
        break;
      case 'connected':
        if (remoteMediaStatus) remoteMediaStatus.textContent = 'Tela conectada via WebRTC.';
        break;
      case 'disconnected':
        resetRemoteViewer('WebRTC desconectado. Aguardando recuperação da conexão...');
        break;
      case 'failed':
        resetRemoteViewer('Não foi possível criar a rota WebRTC. Esta rede pode exigir um servidor TURN.');
        break;
      case 'closed':
        resetRemoteViewer('Transmissão da tela encerrada.');
        break;
    }
  };

  try {
    const offer = await pc.createOffer();
    diagEvent(`Offer criado (${offer.sdp?.length || 0} caracteres).`);
    await pc.setLocalDescription(offer);
    refreshPeerDiagnostics(pc);
    diagEvent('Local description (offer) aplicada.');
    if (!sendSignal('offer', { type: 'offer', sdp: pc.localDescription?.sdp || offer.sdp })) {
      throw new Error('SIGNAL_SOCKET_NOT_OPEN');
    }
    viewerOfferSent = true;
    diagEvent('Offer enviado ao Cloudflare.');

    const queued = localIceQueue;
    localIceQueue = [];
    queued.forEach(candidate => sendSignal('ice', candidate));
  } catch (error) {
    console.warn('Remote Link WebRTC start error', error);
    stopViewerWebRtc({ notifyAgent: false });
    if (remoteMediaStatus) remoteMediaStatus.textContent = 'Falha ao iniciar a transmissão WebRTC.';
  } finally {
    viewerWebRtcStarting = false;
  }
}

function applyAuthorizationState(code, status) {
  if (status.state === 'authorized' && status.authorized === true) {
    document.getElementById('sessionLabel').textContent = `Código ${code.slice(0,3)} ${code.slice(3)} • autorizado`;
    showView('sessionView');
    toast('Conexão autorizada.');
    void startViewerWebRtc(code);
    return 'authorized';
  }

  if (status.state === 'denied') {
    closeSessionSocket();
    showView('supportView');
    setFormError('A pessoa no computador negou a solicitação de acesso.');
    return 'denied';
  }

  if (status.state === 'expired' || status.state === 'closed') {
    closeSessionSocket();
    showView('supportView');
    setFormError(status.state === 'closed'
      ? 'A sessão foi encerrada no computador remoto.'
      : 'O código expirou. Peça à pessoa para gerar um novo código.');
    return status.state;
  }

  connectingText.textContent = 'Solicitação enviada. Aguardando a pessoa clicar em PERMITIR no computador.';
  return null;
}

async function waitForAuthorization(code, viewerToken, attemptId) {
  viewerTokenInMemory = viewerToken;

  return new Promise((resolve) => {
    let finished = false;
    let fallbackBusy = false;

    const finish = (state) => {
      if (finished) return;
      finished = true;
      clearInterval(fallbackTimer);
      resolve(state);
    };

    const processState = (status) => {
      if (attemptId !== connectionAttempt) {
        finish('cancelled');
        return;
      }
      const terminal = applyAuthorizationState(code, status);
      if (terminal) finish(terminal);
    };

    const wsUrl = `${WS_BASE}/api/sessions/${code}/ws?role=viewer&token=${encodeURIComponent(viewerToken)}`;
    const ws = new WebSocket(wsUrl);
    sessionSocket = ws;

    ws.addEventListener('open', () => {
      if (attemptId !== connectionAttempt) {
        try { ws.close(); } catch { }
        return;
      }
      connectingText.textContent = 'Canal em tempo real conectado. Aguardando autorização no computador.';
      diagEvent('WebSocket viewer conectado.');
    });

    ws.addEventListener('message', (event) => {
      if (attemptId !== connectionAttempt) return;
      try {
        const message = JSON.parse(event.data);
        if (message?.type === 'session-state') {
          processState(message);
        } else if (message?.type === 'signal') {
          diagEvent(`Sinal recebido via Cloudflare: ${message.kind || 'desconhecido'}.`);
          void handleViewerSignal(message);
        } else if (message?.type === 'signal-ack') {
          setDiag(diagRelay, `${message.kind || 'sinal'} encaminhado`);
          diagEvent(`ACK do relay Cloudflare: ${message.kind || 'sinal'}.`);
        }
      } catch { }
    });

    ws.addEventListener('close', () => {
      if (!finished && attemptId === connectionAttempt) {
        connectingText.textContent = 'Canal em tempo real indisponível. Usando verificação de fallback...';
      }
    });

    ws.addEventListener('error', () => {
      if (!finished && attemptId === connectionAttempt) {
        connectingText.textContent = 'Falha no canal em tempo real. Usando verificação de fallback...';
      }
    });

    const fallbackTimer = window.setInterval(async () => {
      if (finished || fallbackBusy || attemptId !== connectionAttempt) return;
      fallbackBusy = true;
      try {
        const status = await api(`/api/sessions/${code}/status`, { method: 'GET' });
        processState(status);
      } catch {
        // O WebSocket continua sendo o caminho principal.
      } finally {
        fallbackBusy = false;
      }
    }, FALLBACK_POLL_INTERVAL_MS);
  });
}

async function requestTemporaryAccess(code, password) {
  const attemptId = ++connectionAttempt;
  setFormError('');
  showView('connectingView');
  connectingText.textContent = 'Validando código e senha temporária...';

  try {
    const result = await api('/api/sessions/request-access', {
      method: 'POST',
      body: JSON.stringify({ code, password }),
    });

    if (attemptId !== connectionAttempt) return;

    if (result.state !== 'requested' || !result.viewerToken) {
      throw new Error('UNEXPECTED_SESSION_STATE');
    }

    // A senha não é persistida nem reutilizada depois da validação.
    passwordInput.value = '';
    connectingText.textContent = 'Solicitação enviada. Aguardando a pessoa clicar em PERMITIR no computador.';
    await waitForAuthorization(code, result.viewerToken, attemptId);
  } catch (error) {
    if (attemptId !== connectionAttempt) return;
    showView('supportView');
    setFormError(friendlyError(error));
  }
}

document.getElementById('supportBtn').addEventListener('click', () => {
  setFormError('');
  showView('supportView');
});

document.getElementById('pairBtn').addEventListener('click', () => showView('pairView'));

document.querySelectorAll('[data-back]').forEach(btn => btn.addEventListener('click', () => {
  cancelCurrentAttempt();
  setFormError('');
  showView('homeView');
}));

document.getElementById('cancelConnectBtn').addEventListener('click', () => {
  cancelCurrentAttempt();
  showView('supportView');
  setFormError('Solicitação cancelada neste dispositivo.');
});

document.getElementById('endSessionBtn').addEventListener('click', () => {
  stopViewerWebRtc({ notifyAgent: true });
  connectionAttempt += 1;
  if (sessionSocket) {
    try { sessionSocket.close(1000, 'Remote Link encerrado pelo viewer'); } catch { }
  }
  sessionSocket = null;
  viewerTokenInMemory = null;
  showView('homeView');
  toast('Sessão encerrada neste dispositivo.');
});

codeInput.addEventListener('input', () => {
  codeInput.value = formatCode(codeInput.value);
});

supportForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const code = normalizeCode(codeInput.value);
  const password = passwordInput.value.trim();

  if (code.length !== 6 || !/^\d{4,8}$/.test(password)) {
    setFormError('Informe um código válido de 6 dígitos e uma senha temporária de 4 a 8 dígitos.');
    return;
  }

  connectSubmitBtn.disabled = true;
  try {
    await requestTemporaryAccess(code, password);
  } finally {
    connectSubmitBtn.disabled = false;
  }
});

document.getElementById('simulatePairBtn').addEventListener('click', () => {
  const devices = JSON.parse(localStorage.getItem('rl_trusted_devices') || '[]');
  if (!devices.some(d => d.id === 'demo-pc')) {
    devices.push({ id: 'demo-pc', name: 'Meu computador', lastSeen: 'Pareado para demonstração' });
    localStorage.setItem('rl_trusted_devices', JSON.stringify(devices));
  }
  renderTrustedDevices();
  showView('homeView');
  toast('Pareamento simulado concluído.');
});

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  showInstallNudge();
});

// Mouse/caneta: Pointer Events. Em touch usamos eventos touch explícitos,
// porque alguns Android/Samsung interrompem pointermove ao iniciar um gesto.
installBtn.addEventListener('pointerdown', (e) => {
  if (e.pointerType === 'touch') return;
  beginInstallDrag(e.clientX, e.clientY);
  installBtn.setPointerCapture?.(e.pointerId);
});

installBtn.addEventListener('pointermove', (e) => {
  if (e.pointerType === 'touch') return;
  moveInstallDrag(e.clientX, e.clientY);
});

installBtn.addEventListener('pointerup', (e) => {
  if (e.pointerType === 'touch') return;
  finishInstallDrag();
});

installBtn.addEventListener('pointercancel', (e) => {
  if (e.pointerType === 'touch') return;
  resetInstallDrag();
});

installBtn.addEventListener('touchstart', (e) => {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  beginInstallDrag(touch.clientX, touch.clientY);
}, { passive: true });

installBtn.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 1) return;
  const touch = e.touches[0];
  const handled = moveInstallDrag(touch.clientX, touch.clientY);
  if (handled) e.preventDefault();
}, { passive: false });

installBtn.addEventListener('touchend', () => {
  finishInstallDrag();
}, { passive: true });

installBtn.addEventListener('touchcancel', () => {
  resetInstallDrag();
}, { passive: true });

installBtn.addEventListener('click', async (e) => {
  // Evita que o toque que terminou um swipe também abra o prompt de instalação.
  if (installSwipeDismissed) {
    installSwipeDismissed = false;
    e.preventDefault();
    return;
  }

  if (!deferredPrompt) {
    hideInstallNudge();
    toast('Use o menu do navegador e escolha “Instalar app”.');
    return;
  }

  if (installHideTimer) {
    clearTimeout(installHideTimer);
    installHideTimer = null;
  }

  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  hideInstallNudge();
});

window.addEventListener('appinstalled', () => {
  deferredPrompt = null;
  hideInstallNudge();
  toast('Remote Link instalado.');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js'));
}

mouseControlBtn?.addEventListener('click', () => {
  if (!viewerControlChannel || viewerControlChannel.readyState !== 'open') {
    toast('O canal de controle ainda não está pronto.');
    return;
  }
  setMouseControlEnabled(!mouseControlEnabled);
});

remoteStage?.addEventListener('pointerdown', (event) => {
  if (event.pointerType === 'touch') return;
  if (!mouseControlEnabled || !remoteStage.classList.contains('media-active')) return;
  if (event.pointerType === 'touch' && multiTouchScroll) return;

  const point = getRemotePoint(event.clientX, event.clientY);
  if (!point) return;
  event.preventDefault();
  try { remoteStage.setPointerCapture?.(event.pointerId); } catch { }
  pointerGesture = {
    pointerId: event.pointerId,
    pointerType: event.pointerType,
    startX: event.clientX,
    startY: event.clientY,
    startedAt: performance.now(),
    moved: false,
  };
  sendMouseMove(event.clientX, event.clientY, true);
}, { passive: false });

remoteStage?.addEventListener('pointermove', (event) => {
  if (event.pointerType === 'touch') return;
  if (!mouseControlEnabled || !remoteStage.classList.contains('media-active')) return;

  if (event.pointerType === 'mouse') {
    sendMouseMove(event.clientX, event.clientY);
    return;
  }

  if (!pointerGesture || pointerGesture.pointerId !== event.pointerId || multiTouchScroll) return;
  event.preventDefault();
  if (Math.hypot(event.clientX - pointerGesture.startX, event.clientY - pointerGesture.startY) > 10) {
    pointerGesture.moved = true;
  }
  sendMouseMove(event.clientX, event.clientY);
}, { passive: false });

remoteStage?.addEventListener('pointerup', (event) => {
  if (event.pointerType === 'touch') return;
  if (!mouseControlEnabled || !pointerGesture || pointerGesture.pointerId !== event.pointerId) return;
  event.preventDefault();
  const gesture = pointerGesture;
  resetPointerGesture();
  if (multiTouchScroll) return;

  sendMouseMove(event.clientX, event.clientY, true);
  const duration = performance.now() - gesture.startedAt;
  const distance = Math.hypot(event.clientX - gesture.startX, event.clientY - gesture.startY);
  if (!gesture.moved && distance <= 10) {
    sendControlMessage({ type: 'mouse', action: duration >= 650 ? 'right-click' : 'left-click' });
  }
}, { passive: false });

remoteStage?.addEventListener('pointercancel', () => resetPointerGesture(), { passive: true });

remoteStage?.addEventListener('contextmenu', (event) => {
  if (!mouseControlEnabled) return;
  event.preventDefault();
  sendMouseMove(event.clientX, event.clientY, true);
  sendControlMessage({ type: 'mouse', action: 'right-click' });
});

remoteStage?.addEventListener('wheel', (event) => {
  if (!mouseControlEnabled) return;
  event.preventDefault();
  sendMouseMove(event.clientX, event.clientY, true);
  const delta = Math.max(-360, Math.min(360, Math.round(event.deltaY)));
  if (delta) sendControlMessage({ type: 'mouse', action: 'scroll', delta });
}, { passive: false });

remoteStage?.addEventListener('touchstart', (event) => {
  if (!mouseControlEnabled || !remoteStage.classList.contains('media-active')) return;

  if (event.touches.length === 2) {
    multiTouchScroll = true;
    resetPointerGesture();
    lastTwoFingerY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    event.preventDefault();
    return;
  }

  if (event.touches.length !== 1 || multiTouchScroll) return;
  const touch = event.touches[0];
  const point = getRemotePoint(touch.clientX, touch.clientY);
  if (!point) return;

  pointerGesture = {
    pointerId: 'touch',
    pointerType: 'touch',
    startX: touch.clientX,
    startY: touch.clientY,
    lastX: touch.clientX,
    lastY: touch.clientY,
    startedAt: performance.now(),
    moved: false,
  };
  sendMouseMove(touch.clientX, touch.clientY, true);
  event.preventDefault();
}, { passive: false });

remoteStage?.addEventListener('touchmove', (event) => {
  if (!mouseControlEnabled || !remoteStage.classList.contains('media-active')) return;

  if (multiTouchScroll && event.touches.length === 2) {
    event.preventDefault();
    const currentY = (event.touches[0].clientY + event.touches[1].clientY) / 2;
    if (lastTwoFingerY !== null) {
      const movement = lastTwoFingerY - currentY;
      if (Math.abs(movement) >= 3) {
        sendControlMessage({ type: 'mouse', action: 'scroll', delta: Math.round(movement * 5) });
        lastTwoFingerY = currentY;
      }
    }
    return;
  }

  if (!pointerGesture || event.touches.length !== 1) return;
  const touch = event.touches[0];
  pointerGesture.lastX = touch.clientX;
  pointerGesture.lastY = touch.clientY;
  if (Math.hypot(touch.clientX - pointerGesture.startX, touch.clientY - pointerGesture.startY) > 8) {
    pointerGesture.moved = true;
  }
  sendMouseMove(touch.clientX, touch.clientY);
  event.preventDefault();
}, { passive: false });

remoteStage?.addEventListener('touchend', (event) => {
  if (!mouseControlEnabled) return;

  if (multiTouchScroll) {
    if (event.touches.length < 2) {
      multiTouchScroll = false;
      lastTwoFingerY = null;
      resetPointerGesture();
    }
    return;
  }

  if (!pointerGesture || pointerGesture.pointerType !== 'touch') return;
  const gesture = pointerGesture;
  const changed = event.changedTouches?.[0];
  const endX = changed?.clientX ?? gesture.lastX ?? gesture.startX;
  const endY = changed?.clientY ?? gesture.lastY ?? gesture.startY;
  resetPointerGesture();
  sendMouseMove(endX, endY, true);

  const duration = performance.now() - gesture.startedAt;
  const distance = Math.hypot(endX - gesture.startX, endY - gesture.startY);
  if (!gesture.moved && distance <= 10) {
    sendControlMessage({ type: 'mouse', action: duration >= 650 ? 'right-click' : 'left-click' });
  }
  event.preventDefault();
}, { passive: false });

remoteStage?.addEventListener('touchcancel', () => {
  multiTouchScroll = false;
  lastTwoFingerY = null;
  resetPointerGesture();
}, { passive: true });

screensControlBtn?.addEventListener('click', openScreensModal);
screensModalClose?.addEventListener('click', closeScreensModal);
screensModal?.addEventListener('click', (event) => {
  if (event.target === screensModal) closeScreensModal();
});

fullscreenBtn?.addEventListener('click', async () => {
  try {
    if (!document.fullscreenElement) {
      await remoteStage?.requestFullscreen?.();
    } else {
      await document.exitFullscreen?.();
    }
  } catch {
    toast('Tela cheia não está disponível neste navegador.');
  }
});

renderTrustedDevices();


// Rodapé / modal Sobre — v0.5.1
const aboutLink = document.getElementById('aboutLink');
const aboutModal = document.getElementById('aboutModal');
const aboutModalClose = document.getElementById('aboutModalClose');
let aboutLastFocus = null;

function openAboutModal() {
  aboutLastFocus = document.activeElement;
  aboutModal.hidden = false;
  document.body.style.overflow = 'hidden';
  aboutModalClose.focus();
}

function closeAboutModal() {
  aboutModal.hidden = true;
  document.body.style.overflow = '';
  aboutLastFocus?.focus?.();
}

aboutLink?.addEventListener('click', openAboutModal);
aboutModalClose?.addEventListener('click', closeAboutModal);
aboutModal?.addEventListener('click', (event) => {
  if (event.target === aboutModal) closeAboutModal();
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !screensModal?.hidden) closeScreensModal();
  if (event.key === 'Escape' && !aboutModal?.hidden) closeAboutModal();
});
