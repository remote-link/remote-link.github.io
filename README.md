# Remote Link Web — v0.6.2

PWA do Remote Link hospedada no GitHub Pages.

## Modos de conexão

### Suporte supervisionado
Informe apenas o código temporário de 6 dígitos. O computador remoto exibirá **NEGAR / PERMITIR**.

### Acesso permanente
Informe o ID fixo de 9 dígitos e a senha definida no Agent. O acesso é iniciado sem confirmação local quando o Agent estiver online no modo permanente.

A senha permanente fica somente em memória durante a tentativa e não é persistida pela PWA. Vídeo, mouse, teclado, seleção de monitores, tela cheia e proteção contra pull-to-refresh permanecem disponíveis.


## v0.6.2 — correções

- acesso supervisionado continua usando somente código temporário;
- acesso permanente busca um desafio do servidor e deriva o verificador da senha no navegador via PBKDF2-SHA256;
- a senha digitada não é enviada ao Worker em texto.


## v0.6.2 — touchscreen e troca de monitores

- adiciona botão ☝ para toque nativo remoto no Windows (um contato);
- toque e arraste na imagem passam como eventos de touchscreen, não apenas como mouse;
- mantém o modo 🖱 separado para clique, clique direito e scroll;
- corrige o mapeamento das coordenadas quando o Agent usa barras internas no canvas fixo 1280x720;
- preserva teclado, múltiplos monitores e autenticação da v0.6.1.
