# Remote Link Web — v0.4.1

PWA do Remote Link hospedada no GitHub Pages.

## Novidade desta versão

- A autorização passa a usar WebSocket em tempo real como caminho principal.
- Após validar código + senha, a PWA recebe um `viewerToken` efêmero.
- O token permanece somente na memória da página; não é salvo em LocalStorage.
- A resposta PERMITIR/NEGAR do Agent chega imediatamente pela conexão WebSocket.
- Consulta HTTP a cada 10 segundos permanece como fallback.
- O canal já aceita mensagens de sinalização WebRTC (`offer`, `answer`, `ice`) para a próxima etapa.
- Mantidos o rodapé/modal Sobre e o convite de instalação temporário.

Ainda não há transmissão real da tela nesta versão.


## Visualizacao da tela via WebRTC — v0.4.1

- PWA cria a oferta WebRTC somente apos a autorizacao local no Agent.
- Agent transmite somente a tela principal.
- Primeira calibracao: ate 1280x720, aproximadamente 5 FPS, codec VP8.
- Mouse, teclado, clipboard e arquivos continuam desabilitados.
- A sinalizacao passa pelo Cloudflare, mas a midia tenta seguir peer-to-peer via ICE/STUN.
- Esta etapa usa STUN, sem TURN dedicado; redes com NAT restritivo podem exigir relay TURN em uma etapa posterior.
