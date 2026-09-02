# Remote Link Web — v0.5.0

PWA com visualização da tela e primeira etapa de controle remoto por mouse.

## Mouse

O botão 🖱 fica disponível somente quando o WebRTC DataChannel estiver conectado. Ao ativá-lo:

- mover o mouse no desktop move o ponteiro remoto;
- arrastar um dedo sobre a tela no celular move o ponteiro;
- toque curto executa clique esquerdo;
- toque longo (aprox. 650 ms) executa clique direito;
- clique direito do mouse físico é encaminhado;
- roda do mouse faz scroll;
- gesto vertical com dois dedos faz scroll no celular.

Os comandos trafegam diretamente pelo WebRTC DataChannel `remote-link-control-v1`; não passam pelo Worker como comandos de entrada.

A proteção contra pull-to-refresh e o diagnóstico WebRTC continuam ativos. Teclado e clipboard permanecem desabilitados.
