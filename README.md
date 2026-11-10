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
| Ranking mensal de likes | `/overlay/ranking-mensal-likes` | pronto |
| Ranking mensal de coins | `/overlay/ranking-mensal-coins` | pronto |
| Meta de presente | `/overlay/meta/<id>` (um link por meta) | pronto |

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

## Metas de presente (aba Metas do painel)

Escolha um presente e quantos quer receber. O overlay mostra o presente pulsando com a contagem (ex.: Rosa 3/10), uma barra e textos em cima e embaixo, que você personaliza com `{atual}`, `{meta}`, `{faltam}`, `{presente}` e `{vezes}`. A contagem sobe na hora, até durante combos.

- Cada meta tem o seu link: `/overlay/meta/<id>`, mostrado na aba com prévia.
- Ao bater: comemora com confete e escolhe entre recomeçar, ficar "concluída" ou sumir. Pode tocar um áudio ou vídeo da biblioteca.
- Mostra quem mais ajudou (👑), botões de +1/−1, zerar, editar e ligar/desligar.
- Opções no link: `?barra=0`, `?cor=ff4f8b`, `?tamanho=150`.

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

No painel, a seção **Testar sem estar ao vivo** gera eventos falsos (comentário, presente, combo de rosas, likes, follow, share). Eles aparecem no painel e em todos os overlays abertos.

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
- `src/gifts.js` catálogo de presentes
- `src/giftImport.js` baixa a lista oficial de presentes do TikTok
- `src/goals.js` metas de presente
- `src/monthly.js` ranking mensal
- `public/panel/` painel
- `public/overlay/` um arquivo HTML por overlay
- `data/` configurações, rankings, ações, presentes e mídias (fica fora do Git)

Veja o [ROADMAP.md](ROADMAP.md) para o que vem a seguir.
