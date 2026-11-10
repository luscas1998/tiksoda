# TikSoda

App local para lives do TikTok: overlays, rankings e ações por presente. Roda no seu PC e funciona com o TikTok LIVE Studio.

> Usa a biblioteca não oficial [tiktok-live-connector](https://github.com/zerodytrash/TikTok-Live-Connector) para ler os eventos da live. Ela pode parar de funcionar quando o TikTok muda algo; nesse caso, atualizar a biblioteca costuma resolver.

## Como usar (Windows)

1. Instale o [Node.js](https://nodejs.org) (versão LTS), só na primeira vez.
2. Baixe este repositório (botão verde **Code → Download ZIP**) e extraia numa pasta.
3. Dê dois cliques em `iniciar.bat`. Na primeira vez ele instala o que precisa.
4. O painel abre no navegador em `http://localhost:3330/painel/`.
5. Digite o seu @ e clique em **Conectar** (a live precisa estar no ar).

Deixe a janela preta aberta durante a live. Fechou ela, o app para.

## Overlays no TikTok LIVE Studio

Cada overlay tem o seu próprio link, mostrado no painel com botão de copiar.

1. No LIVE Studio, clique em **Adicionar fonte → Link**.
2. Cole o link do overlay, por exemplo `http://localhost:3330/overlay/eventos`.
3. Ajuste o tamanho e a posição na cena.

| Overlay | Link | Status |
|---|---|---|
| Feed de eventos | `/overlay/eventos` | pronto |
| Alertas | `/overlay/alertas` | pronto |
| Ranking de likes | `/overlay/ranking-likes` | pronto |
| Ranking de coins | `/overlay/ranking-coins` | pronto |
| Áudio e vídeo das ações | `/overlay/midia` | pronto |

### Opções do feed de eventos

Dá pra ajustar pelo link:

- `?max=6` quantos itens aparecem (padrão 8)
- `?tempo=15` cada item some depois de 15 segundos (padrão: não some)
- `?tipos=gift,follow` quais eventos mostrar (`chat`, `gift`, `follow`, `share`)

Exemplo: `http://localhost:3330/overlay/eventos?max=5&tempo=20&tipos=gift,follow,share`

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

Os rankings contam a live atual. Zeram sozinhos quando você conecta numa live nova e ficam salvos em `data/session.json`, então fechar e abrir o app no meio da live não perde nada. No painel tem o botão **Zerar rankings**.

### Opções do áudio e vídeo

- `?fila=0` toca tudo ao mesmo tempo (padrão: um depois do outro)
- `?volume=80` volume geral, em %
- `?ajustar=0` vídeo no tamanho original (padrão: ocupa a tela toda)

Coloque este overlay em tela cheia no LIVE Studio. No navegador comum o som pode precisar de um clique pra liberar; no LIVE Studio e no OBS não precisa.

## Ações (aba Ações do painel)

Regras do tipo "quando acontecer X, tocar Y":

- **Presente**: ao receber um presente específico, toca um áudio, vídeo ou GIF. Dá pra repetir pela quantidade (5 rosas = 5 vezes, até 10).
- **Meta de likes**: a cada N likes na live, ou uma vez ao chegar em N likes.

Envie os arquivos na **Biblioteca de mídia** da mesma aba; eles ficam em `data/midia/`. Cada ação tem botão de **Testar**, liga/desliga, editar e apagar.

### Lista de presentes

A lista oficial completa de presentes do TikTok só vem pelo plano pago do serviço de assinatura. Por isso o app aprende sozinho: todo presente que chega numa live conectada (sua ou de outro criador) fica salvo em `data/gifts.json`, com nome, valor e imagem. Dica: conecte numa live grande por alguns minutos pra encher a lista. Também dá pra digitar o nome exato do presente.

## Testar sem estar ao vivo

No painel, a seção **Testar sem estar ao vivo** gera eventos falsos (comentário, presente, likes, follow, share). Eles aparecem no painel e em todos os overlays abertos.

## Para desenvolver

```bash
npm install
npm run dev   # reinicia sozinho ao salvar
```

- `src/server.js` servidor web, API e WebSocket
- `src/live.js` conexão com a live
- `src/normalize.js` converte eventos do TikTok num formato simples
- `src/overlays.js` lista de overlays
- `src/session.js` rankings e totais da live
- `src/actions.js` regras de ações (presente/likes → mídia)
- `src/media.js` biblioteca de mídia
- `src/gifts.js` catálogo de presentes aprendido
- `public/panel/` painel
- `public/overlay/` um arquivo HTML por overlay
- `data/` configurações, rankings, ações, presentes e mídias (fica fora do Git)

Veja o [ROADMAP.md](ROADMAP.md) para o que vem a seguir.
