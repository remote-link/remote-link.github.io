const API_BASE = 'https://remote-link-server.remote-link.workers.dev';
const POLL_INTERVAL_MS = 2000;

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
let installDragDeltaX = 0;

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
  installDragDeltaX = 0;
  installBtn.style.transform = '';
  installBtn.style.opacity = '';
}
let connectionAttempt = 0;

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

function cancelCurrentAttempt() {
  connectionAttempt += 1;
}

async function waitForAuthorization(code, attemptId) {
  while (attemptId === connectionAttempt) {
    await new Promise(resolve => setTimeout(resolve, POLL_INTERVAL_MS));
    if (attemptId !== connectionAttempt) return;

    const status = await api(`/api/sessions/${code}/status`, { method: 'GET' });

    if (status.state === 'authorized' && status.authorized === true) {
      document.getElementById('sessionLabel').textContent = `Código ${code.slice(0,3)} ${code.slice(3)} • autorizado`;
      showView('sessionView');
      toast('Conexão autorizada.');
      return;
    }

    if (status.state === 'denied') {
      showView('supportView');
      setFormError('A pessoa no computador negou a solicitação de acesso.');
      return;
    }

    if (status.state === 'expired') {
      showView('supportView');
      setFormError('O código expirou. Peça à pessoa para gerar um novo código.');
      return;
    }

    connectingText.textContent = 'Solicitação enviada. Aguardando a pessoa clicar em PERMITIR no computador.';
  }
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

    if (result.state !== 'requested') {
      throw new Error('UNEXPECTED_SESSION_STATE');
    }

    // A senha não é persistida nem reutilizada depois da validação.
    passwordInput.value = '';
    connectingText.textContent = 'Solicitação enviada. Aguardando a pessoa clicar em PERMITIR no computador.';
    await waitForAuthorization(code, attemptId);
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

installBtn.addEventListener('pointerdown', (e) => {
  installDragStartX = e.clientX;
  installDragDeltaX = 0;
  installBtn.setPointerCapture?.(e.pointerId);
});

installBtn.addEventListener('pointermove', (e) => {
  if (installDragStartX === null) return;

  installDragDeltaX = e.clientX - installDragStartX;
  const limited = Math.max(-120, Math.min(120, installDragDeltaX));
  installBtn.style.transform = `translateX(${limited}px)`;
  installBtn.style.opacity = String(Math.max(0.35, 1 - Math.abs(limited) / 150));
});

installBtn.addEventListener('pointerup', () => {
  if (Math.abs(installDragDeltaX) >= INSTALL_SWIPE_DISMISS_PX) {
    hideInstallNudge({ swiped: true });
    installDragStartX = null;
    installDragDeltaX = 0;
    return;
  }
  resetInstallDrag();
});

installBtn.addEventListener('pointercancel', resetInstallDrag);

installBtn.addEventListener('click', async () => {
  if (Math.abs(installDragDeltaX) >= INSTALL_SWIPE_DISMISS_PX) return;

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
