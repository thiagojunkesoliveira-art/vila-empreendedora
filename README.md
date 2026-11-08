# Último Abrigo

Jogo incremental de sobrevivência zumbi para Windows. Você começa num abrigo abandonado com uma pistola velha
e quase nada para comer, e precisa transformá-lo numa fortaleza capaz de resistir às maiores hordas.
Projeto de uso pessoal.

> O app instalado continua se chamando **Vila Empreendedora** (o nome do primeiro jogo deste projeto),
> para a atualização automática continuar funcionando no mesmo app.

## Como se joga

| Aba | O que tem |
| --- | --- |
| **Base** | Missão atual, próxima horda, coleta manual e as 12 construções (barracas, horta, reservatório, depósito, posto de coleta, muralhas, oficina, torre, enfermaria, gerador, arsenal e destilaria). |
| **Recursos** | Estoque, limite, produção e consumo por minuto de cada recurso, energia e materiais raros. |
| **Exploração** | Mapa com 7 locais (supermercado, posto, hospital, delegacia, shopping, fábrica e base militar), escolha do grupo, expedições e relatórios. |
| **Sobreviventes** | Cada pessoa tem nível, especialização, produtividade, vida, estado de saúde, função e equipamento. |
| **Arsenal** | Fabricação de armas, proteções, armadilhas e munição; inventário com raridades, melhorias, reparo e desmonte. |
| **Tecnologias** | 28 pesquisas em 5 ramos (Sobrevivência, Defesa, Indústria, Exploração, Medicina). |
| **Estatísticas** | Números da partida, 24 conquistas, prestígio, salvar, backup e reiniciar. |

- **Hordas** atacam de tempos em tempos e ficam mais fortes a cada onda. Há 6 tipos de zumbi e um **chefe a cada 5 ondas**.
  A batalha aparece no topo da tela e pode ser acelerada (1×, 2×, 4×) ou resolvida na hora.
- Se uma horda vencer, ela leva parte do estoque (nunca a última reserva), e a mesma onda volta mais fraca.
- **Prestígio** (a partir da onda 15): funde uma nova colônia e ganhe pontos de Esperança para bônus permanentes.
- O jogo **continua produzindo com ele fechado** (até 8 horas, mais com prestígio). Enquanto você está fora,
  no máximo 3 hordas atacam; as outras esperam você voltar.

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
- O jogo salva sozinho a cada 15 segundos e ao fechar. Também há o botão **Salvar agora** (ícone de disquete).
- Nada do seu progresso vai para este repositório.

### Backup

Na aba **Estatísticas**:

- **Fazer backup**: salva um arquivo `.json` com todos os seus dados.
- **Restaurar backup**: carrega um arquivo de backup (ou um código colado) e substitui o progresso atual.
- **Desfazer restauração**: volta ao progresso de antes da última restauração ou do último reinício.

Na versão de navegador, o backup é um código de texto: **Fazer backup** copia o código, e no app você usa
**Restaurar backup** e cola o código.

## Publicar uma nova versão

1. Faça as mudanças no jogo (`src/js/*.js`, `src/style.css`, `src/index.html`).
2. Aumente o número em `"version"` no `package.json` (exemplo: `2.0.0` para `2.0.1`).
3. Faça o commit e envie para a branch `main`:

   ```bash
   git add -A
   ```

   ```bash
   git commit -m "Versão 2.0.1"
   ```

   ```bash
   git push
   ```

4. O GitHub Actions monta o instalador e publica a release `v2.0.1` sozinho (leva uns 3 minutos).
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
| `npm run web` | Gera a versão de navegador em um arquivo só: `web/ultimo-abrigo.html` |

### Estrutura

- `main.js`: janela do Electron, segurança, backup em arquivo e atualização automática.
- `preload.js`: a única ponte entre o jogo e o sistema (`contextBridge`).
- `src/index.html` e `src/style.css`: página, ícones (SVG) e visual.
- `src/js/data.js`: recursos, construções, zumbis, locais, equipamentos, tecnologias e prestígio.
- `src/js/core.js`: estado do jogo, economia, sobreviventes, fabricação, pesquisa, missões, conquistas, salvamento e progresso offline.
- `src/js/combat.js`: hordas e simulação das batalhas.
- `src/js/explore.js`: expedições e eventos aleatórios.
- `src/js/ui.js` e `src/js/main.js`: interface, sons e laço principal.
- `.github/workflows/release.yml`: monta e publica as releases.

O jogo usa as fontes do próprio Windows (Bahnschrift/Segoe UI) e funciona sem internet.
