# Remote Link Web — v0.3.1

PWA do Remote Link hospedada no GitHub Pages.

## O que mudou

- `Conectar por código` agora usa o backend real Cloudflare.
- Envia código + senha temporária para `/api/sessions/request-access`.
- Aguarda a autorização do Agent consultando o estado da sessão.
- Trata autorização, negação, expiração e erros de credenciais.
- Não armazena a senha temporária após a validação.
- Mantém o visual e o fluxo já aprovados.

## Ainda não implementado

- transmissão de tela via WebRTC;
- mouse/teclado reais;
- QR Code real;
- acesso permanente.

## Backend

`https://remote-link-server.remote-link.workers.dev`

## Segurança

A PWA nunca recebe o token secreto do Agent. A autorização continua sendo feita pelo Agent Windows.
