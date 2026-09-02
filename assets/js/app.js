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

function showView(id) {
  views.forEach(v => v.classList.toggle('active', v.id === id));
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

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

function closeSessionSocket() {
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

function applyAuthorizationState(code, status) {
  if (status.state === 'authorized' && status.authorized === true) {
    document.getElementById('sessionLabel').textContent = `Código ${code.slice(0,3)} ${code.slice(3)} • autorizado`;
    showView('sessionView');
    toast('Conexão autorizada.');
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
    });

    ws.addEventListener('message', (event) => {
      if (attemptId !== connectionAttempt) return;
      try {
        const message = JSON.parse(event.data);
        if (message?.type === 'session-state') {
          processState(message);
        }
        // Mensagens type=signal serão usadas pela etapa WebRTC seguinte.
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
  cancelCurrentAttempt();
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

renderTrustedDevices();


// Rodapé / modal Sobre — v0.4.0
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
  if (event.key === 'Escape' && !aboutModal?.hidden) closeAboutModal();
});
