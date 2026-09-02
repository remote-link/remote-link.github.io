# Remote Link Web — v0.5.1

PWA do Remote Link hospedada no GitHub Pages.

## Novidades v0.5.1

- corrige o gesto de mouse no touchscreen Android usando eventos touch explícitos;
- mantém Pointer Events para mouse/caneta em desktop;
- adiciona seletor de monitores durante a sessão;
- recebe do Agent a lista de telas e resolução de cada monitor;
- troca a tela transmitida sem encerrar a sessão;
- mantém mouse, clique esquerdo/direito e scroll via WebRTC DataChannel;
- preserva bloqueio de pull-to-refresh durante a sessão;
- mantém teclado e clipboard desabilitados nesta etapa.

O servidor Cloudflare não precisa ser alterado para esta versão: vídeo e controle continuam trafegando diretamente pelo WebRTC depois da sinalização.
