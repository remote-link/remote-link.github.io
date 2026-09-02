# Remote Link Web — v0.4.3

PWA de diagnóstico da negociação WebRTC.

## Diagnóstico visível

Durante a negociação da tela, a PWA mostra:

- confirmação do relay Cloudflare;
- `signalingState`;
- `iceGatheringState`;
- `iceConnectionState`;
- `connectionState`;
- recebimento do track remoto;
- último evento relevante da negociação.

A proteção contra pull-to-refresh da v0.4.2 foi preservada.

Mouse, teclado e clipboard continuam desabilitados.
