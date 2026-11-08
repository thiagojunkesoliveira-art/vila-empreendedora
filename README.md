# Vila Empreendedora

RPG em pixel art para Windows: você começa uma empresa numa garagem e cresce até a Torre Corporativa.
Projeto de uso pessoal.

## Instalar

1. Abra a página **Releases** deste repositório (menu à direita, "Releases").
2. Na versão mais recente, baixe o arquivo `Vila-Empreendedora-Setup-X.Y.Z.exe`.
3. Abra o arquivo baixado.
   - Se aparecer **"O Windows protegeu o computador"**, clique em **Mais informações** e depois em **Executar assim mesmo**.
     O aviso aparece porque o instalador não tem assinatura digital paga; é esperado em apps pessoais.
4. Siga o instalador. No final ficam atalhos na **área de trabalho** e no **menu Iniciar**.

O app se atualiza sozinho: ao abrir (e a cada 4 horas) ele procura uma versão nova, baixa em segundo plano
e pergunta **"Reiniciar agora?"**. Sem internet, ele simplesmente não atualiza, sem mostrar erro.
A versão instalada aparece no canto inferior esquerdo da janela.

## Seus dados

- O progresso fica salvo no seu computador, em `%APPDATA%\Vila Empreendedora`.
  Ele continua lá entre aberturas, atualizações e até se você desinstalar o app.
- Nada do seu progresso vai para este repositório.

### Backup

No título do jogo ou no menu (tecla **X/Esc**), escolha **Backup**:

- **Fazer backup**: salva um arquivo `.json` com todos os seus dados.
- **Restaurar backup**: carrega um arquivo de backup (ou um código colado) e substitui o progresso atual.
- **Desfazer restauração**: volta ao progresso de antes da última restauração.

Para trazer o progresso da versão do navegador: lá, abra **Backup > Fazer backup** (o código é copiado);
no app, abra **Backup > Restaurar backup > Colar código** e cole com **Ctrl+V**.

## Publicar uma nova versão

1. Faça as mudanças no jogo (`src/game.js`, `src/style.css`, `src/index.html`).
2. Aumente o número em `"version"` no `package.json` (exemplo: `1.0.0` para `1.0.1`).
3. Faça o commit e envie para a branch `main`:

   ```bash
   git add -A
   ```

   ```bash
   git commit -m "Versão 1.0.1"
   ```

   ```bash
   git push
   ```

4. O GitHub Actions monta o instalador e publica a release `v1.0.1` sozinho (leva uns 5 minutos).
   Acompanhe na aba **Actions** do repositório.
5. Na próxima vez que o app abrir, ele baixa a versão nova e pergunta se pode reiniciar.

Se você enviar commits sem mudar a versão, nada é publicado (o workflow vê que a release já existe).
Para publicar manualmente, abra **Actions > Publicar versão > Run workflow**.

## Desenvolvimento

Requer Node.js.

```bash
npm install
```

```bash
npm start
```

| Comando | O que faz |
| --- | --- |
| `npm start` | Abre o app sem instalar |
| `npm run dist` | Monta o instalador em `dist/` sem publicar |
| `npm run icon` | Redesenha o ícone em `build/icon.png` |
| `npm run web` | Gera a versão de navegador em `web/vila-empreendedora.html` |

### Estrutura

- `main.js`: janela do Electron, segurança, backup em arquivo e atualização automática.
- `preload.js`: a única ponte entre o jogo e o sistema (`contextBridge`).
- `src/`: o jogo (HTML, CSS, JavaScript e fontes embutidas, funciona sem internet).
- `.github/workflows/release.yml`: monta e publica as releases.

As fontes Pixelify Sans e Press Start 2P estão sob a SIL Open Font License (veja `src/fonts/`).
