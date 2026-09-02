# Remote Link Web — v0.4.0

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
