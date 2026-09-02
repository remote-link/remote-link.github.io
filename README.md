# Remote Link

PWA leve para acesso e suporte remoto.

## Estado atual

Versão **v0.1.0** — frontend/protótipo navegável.

Inclui:
- instalação como PWA;
- tela inicial responsiva;
- pareamento por QR Code simulado;
- conexão temporária por código + senha;
- tela de conexão;
- tela de sessão remota simulada;
- shell offline via Service Worker.

Ainda não inclui:
- agente Windows;
- WebRTC real;
- signaling/auth backend;
- captura/controle real da área de trabalho.

## Publicação

Este repositório foi preparado para GitHub Pages na raiz:

`https://remote-link.github.io/`

## Segurança

Nenhuma credencial real de acesso remoto deve ser armazenada no GitHub Pages.
Autenticação, signaling e chaves de sessão serão implementados em backend/agente nas próximas versões.
