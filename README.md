# Remote Link Web — v0.8.3

PWA do Remote Link hospedada no GitHub Pages.

## Modos de conexão

### Suporte supervisionado
Informe apenas o código temporário de 6 dígitos. O computador remoto exibirá **NEGAR / PERMITIR**.

### Acesso permanente
Informe o ID fixo de 9 dígitos e a senha definida no Agent. O acesso é iniciado sem confirmação local quando o Agent estiver online no modo permanente.

A senha permanente fica somente em memória durante a tentativa e não é persistida pela PWA. Vídeo, mouse, teclado, seleção de monitores, tela cheia e proteção contra pull-to-refresh permanecem disponíveis.


## v0.6.10 — alternancia Mouse/Touch

- corrige alternancia entre os modos Mouse e Touch sem exigir nova conexao;
- mantem ambos os botoes disponiveis enquanto o DataChannel estiver aberto;
- torna Mouse e Touch mutuamente exclusivos sem chamadas recursivas entre estados;
- limpa gesto pendente ao trocar de modo;
- preserva video, teclado, selecao de monitores e tela cheia.


## v0.6.4 — proporção da tela e toque direto

- Ajusta a área de vídeo à proporção do monitor selecionado.
- Remove o excesso de área preta vertical durante a sessão.
- Mantém o canvas WebRTC fixo, mas apresenta a tela sem deformação visual.
- No modo toque, mapeia o dedo diretamente para a coordenada absoluta da tela remota.
- Clampeia toques próximos às bordas para permitir atingir minimizar/maximizar/fechar em telas pequenas.
- Preserva mouse, teclado, múltiplos monitores e proteção contra pull-to-refresh.

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

## v0.6.10 — troca explícita Mouse/Touch

- Envia ao Agent a mudança de modo assim que Mouse ou Touch é ativado.
- Ao voltar para Mouse, solicita cancelamento de qualquer contato touch pendente e restauração do cursor remoto.
- Mantém os dois botões disponíveis durante toda a sessão.
- Não altera vídeo, teclado, seleção de telas ou autenticação.


## v0.8.0 — clipboard manual de texto

- adiciona botão de clipboard na barra da sessão;
- permite enviar texto para o clipboard do PC remoto e ler texto do clipboard do PC sob ação explícita;
- permite colar/copiar no clipboard local quando o navegador conceder permissão;
- limita cada transferência a 16.384 caracteres;
- não existe sincronização automática ou captura em segundo plano;
- o conteúdo trafega diretamente pelo WebRTC DataChannel, sem usar o Worker.


## v0.8.0 — envio manual de arquivos

- Novo botão `📁` durante a sessão.
- Envio manual de um arquivo do viewer para o PC remoto.
- Limite inicial: 10 MB por arquivo.
- Transmissão em blocos pelo WebRTC DataChannel; não passa pelo Worker.
- O PC salva em `Downloads\Remote Link`.
- Nenhum upload acontece automaticamente.



## v0.8.3 — rolagem do painel de arquivos no mobile

- Corrige modal de Arquivos maior que a altura visível do smartphone.
- Mantém rolagem vertical própria dentro do modal.
- Impede que a proteção contra pull-to-refresh bloqueie a rolagem dos modais.
- Considera a área segura inferior do Android/PWA.
- Preserva transferência de arquivos nos dois sentidos e todos os controles remotos existentes.

## v0.8.2 — arquivo do PC para este dispositivo

- completa a transferencia manual de arquivos nos dois sentidos;
- adiciona `Escolher arquivo no PC`;
- o seletor nativo e aberto no computador remoto e pode ser operado pela sessao;
- o arquivo escolhido e recebido pelo WebRTC DataChannel;
- apos a recepcao, o usuario toca em `Baixar neste dispositivo`;
- limite inicial de 10 MB por arquivo;
- nenhum arquivo passa pelo Cloudflare Worker.


## v0.8.2
- Fecha o painel de arquivos enquanto o seletor do Windows esta aberto, deixando a tela remota livre para operacao.
- Reabre o painel quando a transferencia inicia ou a selecao e cancelada.
