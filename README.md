# Último Abrigo

Jogo de sobrevivência zumbi em mundo aberto, com pixel art vista de cima, para Windows.
Você anda pelo mundo, coleta madeira e pedra, constrói a sua própria base onde quiser,
fabrica armas na bancada e enfrenta hordas de zumbis à noite. Projeto de uso pessoal.

> O app instalado continua se chamando **Vila Empreendedora** (o nome do primeiro jogo deste projeto),
> para a atualização automática continuar funcionando no mesmo app.

## Como se joga

| Tecla | O que faz |
| --- | --- |
| `W` `A` `S` `D` | Andar (`Shift` corre e gasta estamina) |
| Mouse (segurar o botão esquerdo) | Cortar árvores, quebrar pedras e sucata, atacar, atirar e consertar (com o martelo) |
| `1` a `6` ou roda do mouse | Trocar o item na mão |
| `E` | Abrir caixas, usar bancadas, colher, recrutar, alimentar e cuidar dos animais |
| `B` | Modo construção (`Q` troca de aba; clique constrói, botão direito desmonta e devolve metade) |
| `Tab` | Inventário: vestir proteções, pôr itens na barra, desmontar |
| `F` / `H` | Comer / usar curativo |
| `M` | Mapa |
| `Esc` | Pausa, salvar, backup e mundo novo |

- **Mundo**: floresta, lagos, cabanas e uma cidade em ruínas a leste, com supermercado, hospital,
  delegacia e posto de gasolina. Caixas aparecem de novo a cada dia e árvores voltam a crescer.
- **Construção** (abas Defesa, Base e Fazenda): paredes de madeira e de pedra que se conectam, porta, estacas,
  torreta, fogueira, tocha, três bancadas, cama, baú, horta, mudas, árvores frutíferas, cerca e porteira.
  Os zumbis tentam quebrar o que estiver no caminho; o **Martelo** conserta.
- **Bancadas**: a de madeira faz ferramentas de pedra, martelo, lança e curativos; a **de pedra** faz ferramentas de ferro,
  marreta, facão, pistola, proteção e munição; a **Oficina de metal** faz ferramentas de aço, espingarda, rifle,
  submetralhadora e colete. Cada item sai com uma raridade, de Comum a Lendário.
- **Fazenda e animais**: galinhas, ovelhas e vacas vivem na floresta. Alimente com comida (`E`) para domesticar;
  depois elas dão ovos, lã (tecido) e leite. Use cercas e porteiras para segurá-las.
- **Noite e dificuldade**: a cada dia os zumbis ficam mais fortes e aparecem tipos novos: rastejante, veloz, brutamonte,
  cuspidor, blindado, inchado (explode), gritador (chama a horda) e um Colosso a cada 5 noites.
- **Estamina**: correr gasta a barra azul; ela volta quando você anda ou para.
- **Novidades**: a cada versão nova, o jogo mostra o "Patch de atualização" ao abrir (e no menu de pausa).
- **Sobreviventes**: encontre pessoas nas casas e recrute com `E` (cada uma precisa de uma cama).
  Lenhadores cortam árvores, mineradores quebram pedras, agricultores colhem a horta e guardas lutam.
  Cada um come 2 de comida por dia.
- **Tutorial**: um passo a passo no topo da tela ensina o começo (dá para esconder no ×).

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
- O jogo salva sozinho a cada 20 segundos e ao fechar. Também há **Salvar agora** no menu de pausa (`Esc`).
- Nada do seu progresso vai para este repositório.

### Backup

No menu de pausa (`Esc`):

- **Fazer backup**: salva um arquivo `.json` com o mundo inteiro e o seu progresso.
- **Restaurar backup**: carrega um arquivo de backup (ou um código colado) e substitui o mundo atual.
- **Desfazer restauração**: volta ao mundo de antes da última restauração ou do último mundo novo.

Na versão de navegador, o backup é um código de texto: **Fazer backup** copia o código, e no app você usa
**Restaurar backup** e cola o código.

## Publicar uma nova versão

1. Faça as mudanças no jogo (`src/js/*.js`, `src/style.css`, `src/index.html`).
2. Aumente o número em `"version"` no `package.json` (exemplo: `3.1.0` para `3.1.1`).
3. Em `src/js/data.js`, mude `GAME_VERSION` para o mesmo número e escreva as novidades no topo de `PATCHES`
   (é o "Patch de atualização" que o jogo mostra ao abrir). A publicação para com um aviso se faltar isso.
4. Faça o commit e envie para a branch `main`:

   ```bash
   git add -A
   ```

   ```bash
   git commit -m "Versão 3.1.1"
   ```

   ```bash
   git push
   ```

5. O GitHub Actions monta o instalador e publica a release `v3.1.1` sozinho (leva uns 3 minutos).
   Acompanhe na aba **Actions** do repositório.
6. Na próxima vez que o app abrir, ele baixa a versão nova e pergunta se pode reiniciar.

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
| `npm run web` | Gera a versão de navegador em um arquivo só: `web/ultimo-abrigo.html` |

### Estrutura

- `main.js`: janela do Electron, segurança, backup em arquivo e atualização automática.
- `preload.js`: a única ponte entre o jogo e o sistema (`contextBridge`).
- `src/index.html` e `src/style.css`: página e interface.
- `src/js/util.js`: matemática, ruído, sorteios e busca de caminho.
- `src/js/data.js`: terreno, objetos, construções, itens, zumbis, sobreviventes e tutorial.
- `src/js/gfx.js`: toda a pixel art, desenhada em código.
- `src/js/world.js`: geração do mundo (floresta, lagos, cidade) e consultas ao mapa.
- `src/js/game.js`: regras do jogo: coleta, construção, fabricação, zumbis, noite, sobreviventes e salvamento.
- `src/js/render.js`: desenho do mundo, iluminação e minimapa.
- `src/js/ui.js` e `src/js/main.js`: interface, controles, sons e laço principal.
- `.github/workflows/release.yml`: monta e publica as releases.

O jogo usa as fontes do próprio Windows (Bahnschrift/Segoe UI) e funciona sem internet.
