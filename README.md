# Remote Link Web — v0.5.3

PWA do Remote Link hospedada no GitHub Pages.

## Novidades v0.5.3

- habilita o botão de teclado quando o WebRTC DataChannel fica disponível;
- abre um painel de teclado remoto adequado para smartphone;
- o campo de digitação chama o teclado virtual do Android/iOS e envia o texto ao computador remoto;
- adiciona teclas rápidas para `Esc`, `Tab`, `Enter`, `Backspace` e setas;
- adiciona atalhos rápidos `Ctrl+A`, `Ctrl+C`, `Ctrl+V` e `Ctrl+X`;
- suporta teclado físico conectado ao navegador, incluindo `Ctrl`, `Shift` e `Alt`;
- preserva mouse remoto, múltiplos monitores, tela cheia e proteção contra pull-to-refresh;
- o clipboard continua sendo o do próprio computador remoto; sincronização de clipboard entre dispositivos será uma etapa separada.

O servidor Cloudflare não precisa ser alterado nesta versão: vídeo, mouse e teclado trafegam diretamente pelo WebRTC após a sinalização.
