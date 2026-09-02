const views = [...document.querySelectorAll('.view')];
const installBtn = document.getElementById('installBtn');
const trustedList = document.getElementById('trustedList');
let deferredPrompt = null;

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
  return value.replace(/\D/g, '').slice(0, 6).replace(/(\d{3})(\d{1,3})/, '$1 $2').trim();
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
    btn.addEventListener('click', () => beginConnection(`Dispositivo ${btn.dataset.deviceId}`));
  });
}

function beginConnection(label) {
  document.getElementById('connectingText').textContent = `Preparando conexão com ${label}.`;
  showView('connectingView');
  window.setTimeout(() => {
    document.getElementById('sessionLabel').textContent = label;
    showView('sessionView');
  }, 1300);
}

document.getElementById('supportBtn').addEventListener('click', () => showView('supportView'));
document.getElementById('pairBtn').addEventListener('click', () => showView('pairView'));
document.querySelectorAll('[data-back]').forEach(btn => btn.addEventListener('click', () => showView('homeView')));
document.getElementById('cancelConnectBtn').addEventListener('click', () => showView('homeView'));
document.getElementById('endSessionBtn').addEventListener('click', () => {
  showView('homeView');
  toast('Sessão encerrada.');
});

const codeInput = document.getElementById('sessionCode');
codeInput.addEventListener('input', () => {
  codeInput.value = formatCode(codeInput.value);
});

document.getElementById('supportForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const error = document.getElementById('formError');
  const code = codeInput.value.replace(/\D/g, '');
  const password = document.getElementById('sessionPassword').value.trim();

  if (code.length !== 6 || password.length < 4) {
    error.textContent = 'Informe um código válido de 6 dígitos e uma senha temporária.';
    error.hidden = false;
    return;
  }

  error.hidden = true;
  beginConnection(`código ${code.slice(0,3)} ${code.slice(3)}`);
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
  installBtn.hidden = false;
});

installBtn.addEventListener('click', async () => {
  if (!deferredPrompt) {
    toast('Use o menu do navegador e escolha “Instalar app”.');
    return;
  }
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

window.addEventListener('appinstalled', () => {
  installBtn.hidden = true;
  toast('Remote Link instalado.');
});

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/service-worker.js'));
}

renderTrustedDevices();
