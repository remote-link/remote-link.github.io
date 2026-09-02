# Remote Link Web — v0.3.4

PWA do Remote Link hospedada no GitHub Pages.

## O que mudou

- `Conectar por código` agora usa o backend real Cloudflare.
- Envia código + senha temporária para `/api/sessions/request-access`.
- Aguarda a autorização do Agent consultando o estado da sessão.
- Trata autorização, negação, expiração e erros de credenciais.
- Não armazena a senha temporária após a validação.
- Mantém o visual e o fluxo já aprovados.
- O convite de instalação agora aparece por cerca de 8 segundos e some automaticamente.
- O convite pode ser dispensado com gesto horizontal para a esquerda ou direita.
- A instalação continua opcional; o app permanece utilizável normalmente pelo navegador.

## Ainda não implementado

- transmissão de tela via WebRTC;
- mouse/teclado reais;
- QR Code real;
- acesso permanente.

## Backend

`https://remote-link-server.remote-link.workers.dev`

## Segurança

A PWA nunca recebe o token secreto do Agent. A autorização continua sendo feita pelo Agent Windows.


## Ajuste v0.3.3

- Corrige o gesto de arrastar o convite **Instalar** em telas touchscreen Android.
- Usa eventos touch explícitos como fallback para navegadores que cancelam Pointer Events durante gestos.
- Mantém rolagem vertical normal e só captura o gesto quando o movimento horizontal é dominante.
- Evita abrir o prompt de instalação ao terminar um swipe.


## Ajuste v0.3.4

- Adiciona rodapé clicável `© Remote Link - v0.3.4`.
- O rodapé abre um modal com identificação do desenvolvedor.
- Exibe `Desenvolvido por: Mizael Nunes.`
- Exibe email clicável `mizaelnunes001@hotmail.com`.
- Modal pode ser fechado pelo botão, toque fora ou tecla Esc.
