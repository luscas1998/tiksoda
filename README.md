# TikSoda

App local para lives do TikTok: overlays, rankings e ações por presente. Roda no seu PC e funciona com o TikTok LIVE Studio.

> Usa a biblioteca não oficial [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) para ler os eventos da live. Ela pode parar de funcionar quando o TikTok muda algo; nesse caso, atualizar a biblioteca costuma resolver.

## Como usar (Windows): app

1. Baixe o `TikSoda.exe` e coloque numa pasta sua (ex.: `Documentos\TikSoda`).
2. Dê dois cliques. Na primeira vez o Windows pode mostrar "O Windows protegeu o computador", porque o app não tem assinatura paga: clique em **Mais informações → Executar assim mesmo**.
3. O painel abre numa janela própria. Digite o seu @ uma vez: ele fica salvo e o app conecta sozinho toda vez que abrir (e espera a live começar, se ainda não estiver no ar).
4. Em **Configurações** dá pra criar atalho na área de trabalho, no menu Iniciar e abrir junto com o Windows.

O app não tem janela preta. Pra fechar, use o botão **Fechar** no menu lateral do painel. Abrir o exe de novo com ele já rodando só reabre o painel.

**Onde ficam os dados:** em `%APPDATA%\TikSoda` (ações, metas, roletas, mídias, rankings). Se preferir tudo junto do exe (pra levar num pendrive), crie uma pasta `data` ao lado do `TikSoda.exe` antes de abrir. **Configurações → Backup** guarda tudo num arquivo pra levar pra outro PC.

### Como usar sem o exe (Node.js)

1. Instale o [Node.js](https://nodejs.org) (versão LTS), só na primeira vez.
2. Baixe este repositório (botão verde **Code → Download ZIP**) e extraia numa pasta.
3. Dê dois cliques em `iniciar.bat`. Na primeira vez ele instala o que precisa e depois abre o painel em `http://localhost:3330/painel/`.

Nesse modo os dados ficam na pasta `data` do projeto e a janela preta precisa ficar aberta durante a live.

## Painel

Menu lateral com **Início** (conexão, números da live com tempo no ar e pico de espectadores, feed com filtros, rankings, testes), **Overlays** (todos os links por categoria, com tema e prévia), **Ações**, **Metas**, **Roleta**, **TTS** e **Configurações** (conta, desempenho, backup, atalhos do Windows).

Pra gastar pouco PC: as prévias só carregam quando aparecem na tela, e dá pra desligar prévias e animações em **Configurações → Desempenho**. Os overlays no LIVE Studio não são afetados.

## Overlays no TikTok LIVE Studio

Cada overlay tem o seu próprio link, mostrado no painel com botão de copiar.

1. No LIVE Studio, clique em **Adicionar fonte → Link**.
2. Cole o link do overlay, por exemplo `http://tiksoda.localtest.me:3330/overlay/eventos`.
3. Ajuste o tamanho e a posição na cena.

O LIVE Studio não aceita `localhost` nem `127.0.0.1` no campo de link, por isso os links usam `tiksoda.localtest.me`: é um endereço público que aponta pro seu próprio PC (precisa de internet pra funcionar, o que você já tem na live). No OBS qualquer um dos dois funciona.

| Overlay | Link | Status |
|---|---|---|
| Feed de eventos | `/overlay/eventos` | pronto |
| Alertas | `/overlay/alertas` | pronto |
| Ranking de likes | `/overlay/ranking-likes` | pronto |
| Ranking de coins | `/overlay/ranking-coins` | pronto |
| Áudio e vídeo das ações | `/overlay/midia` | pronto |
| Ranking mensal de likes | `/overlay/ranking-mensal-likes` | pronto |
| Ranking mensal de coins | `/overlay/ranking-mensal-coins` | pronto |
| Metas (presente, likes, seguidores, shares, coins) | `/overlay/meta/<id>` (um link por meta) | pronto |
| Chat | `/overlay/chat` | pronto |
| Roleta | `/overlay/roleta/<id>` (um link por roleta) | pronto |
| TTS (comentários em voz alta) | `/overlay/tts` | pronto |
| Contadores (likes, seguidores, shares, coins, espectadores, presentes) | `/overlay/contadores` | pronto |
| Tocando agora (Spotify) | `/overlay/musica` | pronto |

### Temas

Feed, alertas, rankings, chat, TTS, metas e roleta têm 4 temas: **Escuro** (padrão), **Neon**, **Claro** e **Minimalista**. Escolha no seletor ao lado de cada link no painel; a prévia muda na hora e o tema vai no próprio link (`?tema=neon`).

### Opções do feed de eventos

Dá pra ajustar pelo link:

- `?max=6` quantos itens aparecem (padrão 8)
- `?tempo=15` cada item some depois de 15 segundos (padrão: não some)
- `?tipos=gift,follow` quais eventos mostrar (`chat`, `gift`, `follow`, `share`)

Exemplo: `http://tiksoda.localtest.me:3330/overlay/eventos?max=5&tempo=20&tipos=gift,follow,share`

### Opções dos alertas

- `?tipos=gift,follow` quais eventos viram alerta (`gift`, `follow`, `share`)
- `?min=10` só presentes de pelo menos 10 coins
- `?tempo=5` segundos que cada alerta fica na tela

Os alertas entram numa fila: um de cada vez, sem atropelar. Follow repetido da mesma pessoa na mesma live não gera alerta de novo.

### Opções dos rankings

- `?top=5` quantas pessoas aparecem (até 20)
- `?titulo=Top%20da%20live` muda o título
- `?fundo=0` tira o fundo escuro
- `?cor=ff4f8b` cor dos números (sem o #)
- `?coroa=0` tira a coroa e o destaque do primeiro lugar

Os rankings contam a live atual. Zeram sozinhos quando você conecta numa live nova e ficam salvos em `data/session.json`, então fechar e abrir o app no meio da live não perde nada. No painel tem o botão **Zerar rankings**.

### Opções do áudio e vídeo

- `?fila=0` toca tudo ao mesmo tempo (padrão: um depois do outro)
- `?volume=80` volume geral, em %
- `?ajustar=0` vídeo no tamanho original (padrão: ocupa a tela toda)

Coloque este overlay em tela cheia no LIVE Studio. No navegador comum o som pode precisar de um clique pra liberar; no LIVE Studio e no OBS não precisa.

### Opções do chat

- `?max=10` quantas mensagens aparecem · `?tempo=30` cada uma some depois de 30 s
- `?tamanho=22` tamanho da letra · `?avatar=0` sem foto
- `?comandos=0` esconde mensagens que começam com `!` · `?presentes=1` mostra presentes no meio do chat

### Opções dos contadores

- `?itens=likes,follows,shares` quais números aparecem (`likes`, `follows`, `shares`, `coins`, `viewers`, `gifts`)
- `?coluna=1` um embaixo do outro · `?tamanho=28` tamanho · `?legenda=0` só os números
- `?ultimo=1` mostra o último seguidor e o último presente

## Metas (aba Metas do painel)

Meta de um **presente** (ex.: Rosa 3/10), de **likes**, **seguidores**, **shares** ou **coins** da live. Cada uma escolhe um modelo: presente pulsando, barra, círculo, número grande ou copo enchendo. A prévia no formulário mostra o modelo antes de criar.

- Textos em cima e embaixo com `{atual}`, `{meta}`, `{faltam}`, `{porcento}`, `{presente}` e `{vezes}`.
- Cada meta tem o seu link: `/overlay/meta/<id>`, com prévia e seletor de tema.
- Ao bater: comemora com confete e escolhe entre recomeçar, **aumentar a meta** (ex.: +1000 likes), ficar "concluída" ou sumir. Pode tocar um áudio ou vídeo da biblioteca.
- Pode zerar sozinha quando você conecta numa live nova (padrão nas metas de likes, seguidores, shares e coins).
- Mostra quem mais ajudou (👑), botões de +1/−1, zerar, editar e ligar/desligar.
- Opções no link: `?cor=ff4f8b`, `?tamanho=150`, `?barra=0` (modelo presente).

## Roleta (aba Roleta do painel)

Você cadastra as opções (com cor, peso e, se quiser, um áudio/vídeo que toca quando cair nela). A roleta gira:

- pelo botão **Girar** do painel;
- quando alguém comenta o comando (padrão `!roleta`), com espera entre giros e opção de liberar só pra quem já mandou presente;
- quando chega o presente escolhido (um giro por envio ou um por presente).

Os giros entram numa fila. Cada roleta tem o seu link `/overlay/roleta/<id>` e por padrão some da tela quando está parada (`?sempre=1` deixa sempre visível, `?tamanho=420` muda o tamanho).

## TTS (aba TTS do painel)

Lê comentários em voz alta no overlay `/overlay/tts`, com um balão mostrando quem escreveu.

- Lê só quem usar o comando (padrão `!falar`) ou todos os comentários.
- Pode liberar só pra quem já mandou presente na live.
- Texto falado configurável (`{nome} disse: {mensagem}`), limite de letras, espera por pessoa e tamanho da fila.
- Filtros: palavrões, links, palavras e usuários bloqueados.
- Voz do Windows (recomendado: o app gera o áudio e funciona em qualquer programa de live) ou voz do navegador. Escolha a voz, a velocidade e o volume, e teste na própria aba. Botões de pular e limpar a fila.
- Pra ter voz em português no Windows: Configurações → Hora e idioma → Fala → Adicionar vozes.

## Música / Spotify (aba Música do painel)

O chat pede música no seu Spotify e o overlay `/overlay/musica` mostra o que está tocando (capa, nome, artista, tempo e quem pediu).

- **Conectar (uma vez só):** crie um app gratuito em [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) com o Redirect URI `http://127.0.0.1:3330/api/spotify/callback` e a Web API marcada, cole o Client ID na aba Música e clique em **Conectar Spotify**. O login fica salvo.
- **Pedir:** `!musica nome da música` (ou link do Spotify) põe na fila, sem cortar a que está tocando. Precisa de **Spotify Premium** e do Spotify aberto no PC.
- **Quem pode pedir:** todo mundo, ou só seguidores, amigos, fã-clube (quem mandou **Heart Me**), assinantes, moderadores ou quem mandou presente na live (pode marcar mais de um).
- Espera por pessoa, pedidos por pessoa, tamanho da fila, duração máxima, bloquear explícitas, artistas/palavras e usuários bloqueados.
- **Pular:** `!pular` por votação (ex.: 3 votos; 1 = pula na hora), com filtro de quem vota, moderador pulando direto e opção de só deixar pular música pedida pelo chat.
- Controles de tocar/pausar/anterior/próxima e pedido de teste no painel.
- Opções do overlay: `?capa=0`, `?pedido=0`, `?barra=0`, `?avisos=0` (sem o aviso "Fulano pediu…"), `?fila=3` (mostra os próximos pedidos), `?pausada=0` (some quando pausa), `?tamanho=120`.

## Ranking mensal

Ranking de likes e de coins do mês, nos links `/overlay/ranking-mensal-likes` e `/overlay/ranking-mensal-coins` (padrão top 10).

- Conta só quando você está conectado na **sua** live (o @ fica salvo no painel; na primeira conexão ele é preenchido sozinho).
- Eventos de teste não contam.
- Zera sozinho na virada do mês e no botão **Zerar mensal**. O mês fechado vai pro **Histórico** no painel.

## Ações (aba Ações do painel)

Regras do tipo "quando acontecer X, tocar Y":

- **Presente**: ao receber um presente específico, toca um áudio, vídeo ou GIF. Quando mandam vários de uma vez, dá pra escolher:
  - tocar uma vez só (no fim do combo);
  - repetir pela quantidade, um depois do outro (até 10);
  - **cortar e repetir**: cada presente reinicia a mídia na hora, inclusive durante o combo (fica picotado de propósito).
- **Meta de likes**: a cada N likes na live, ou uma vez ao chegar em N likes.

Envie os arquivos na **Biblioteca de mídia** da mesma aba; eles ficam em `data/midia/`. Cada ação tem botão de **Testar**, liga/desliga, editar e apagar.

### Lista de presentes

Nas abas Ações e Metas, o botão **⟳ Atualizar lista do TikTok** baixa a lista oficial de presentes, com ícone, valor e ID. Ele usa a live em que você está conectado; se não estiver, pede o @ de alguém que esteja ao vivo.

Primeiro tenta um pedido direto ao TikTok. Se não der, abre a página da live num Edge ou Chrome invisível do seu PC e pega a lista que a própria página baixa. Pra usar outro navegador, defina a variável `TIKSODA_BROWSER` com o caminho do executável.

O app também continua aprendendo sozinho: todo presente que chega numa live conectada entra na lista (`data/gifts.json`).

## Testar sem estar ao vivo

No painel, a seção **Testar sem estar ao vivo** gera eventos falsos (comentário, presente, combo de rosas, likes, follow, share). Também dá pra mandar um comentário de teste escrito por você (ex.: `!falar oi`, `!roleta`). Eles aparecem no painel e em todos os overlays abertos.

## Para desenvolver

```bash
npm install
npm run dev        # reinicia sozinho ao salvar
npm run build:exe  # gera dist/TikSoda.exe (Windows 64 bits, sem precisar de Node no PC)
```

- `src/server.js` servidor web, API e WebSocket
- `src/app.js` pasta de dados, abrir o painel, atalhos do Windows (modo app)
- `scripts/build-exe.mjs` monta o exe (esbuild + pkg, ícone e sem janela preta)
- `src/live.js` conexão com a live
- `src/normalize.js` converte eventos do TikTok num formato simples
- `src/overlays.js` lista de overlays
- `src/session.js` rankings e totais da live
- `src/actions.js` regras de ações (presente/likes → mídia)
- `src/media.js` biblioteca de mídia
- `src/gifts.js` catálogo de presentes
- `src/giftImport.js` baixa a lista oficial de presentes do TikTok
- `src/goals.js` metas (presente, likes, seguidores, shares, coins)
- `src/monthly.js` ranking mensal
- `src/tts.js` leitura de comentários (voz do Windows)
- `src/wheels.js` roletas
- `src/spotify.js` Spotify (pedidos, pular, tocando agora)
- `public/shared/temas.css` temas dos overlays
- `public/panel/` painel
- `public/overlay/` um arquivo HTML por overlay
- `data/` configurações, rankings, ações, presentes e mídias (fica fora do Git)

Veja o [ROADMAP.md](ROADMAP.md) para o que vem a seguir.
