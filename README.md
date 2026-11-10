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
| Alertas | `/overlay/alertas` | em breve |
| Ranking de likes | `/overlay/ranking-likes` | em breve |
| Ranking de coins | `/overlay/ranking-coins` | em breve |
| Áudio e vídeo por presente | `/overlay/midia` | em breve |

### Opções do feed de eventos

Dá pra ajustar pelo link:

- `?max=6` quantos itens aparecem (padrão 8)
- `?tempo=15` cada item some depois de 15 segundos (padrão: não some)
- `?tipos=gift,follow` quais eventos mostrar (`chat`, `gift`, `follow`, `share`)

Exemplo: `http://localhost:3330/overlay/eventos?max=5&tempo=20&tipos=gift,follow,share`

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
- `public/panel/` painel
- `public/overlay/` um arquivo HTML por overlay
- `data/config.json` configurações salvas (fica fora do Git)
