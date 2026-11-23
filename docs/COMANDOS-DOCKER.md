# Comandos Docker do Vetus: guia para aprender

Todos os comandos são para o **PowerShell**, rodados na pasta do projeto:

```powershell
cd C:\Git\SistemaVetus
```

O `docker compose` lê o arquivo `docker-compose.yml` **da pasta atual**. Por isso, rode sempre a partir da raiz do projeto.

## Conceitos rápidos

| Termo | O que é |
|---|---|
| **Imagem** | Um "pacote" com o programa e tudo o que ele precisa (Node, bibliotecas, código). É construída a partir do `Dockerfile`. |
| **Container** | Uma imagem **em execução**. O Vetus tem dois: `vetus-receptor` e `vetus-web`. |
| **Volume** | Uma pasta guardada pelo Docker que **sobrevive** quando o container é apagado. Os exames ficam no volume `vetus-dados`. |
| **docker-compose.yml** | Arquivo que descreve todos os containers do sistema, portas, volumes e variáveis. Um comando sobe tudo junto. |
| **.env** | Arquivo com as configurações e senhas (porta, AE Title, usuário e senha da área web). **Não vai para o Git.** |
| **Porta `2345:2345`** | `porta do PC : porta dentro do container`. O ultrassom fala com a porta do PC, e o Docker repassa para o container. |

---

## 1. Preparar (só na primeira vez)

### Conferir se o Docker está ligado
```powershell
docker version
```
Mostra a versão do Docker **cliente** (o comando) e do **servidor** (o Docker Desktop). Se aparecer erro na parte "Server", o **Docker Desktop não está aberto**: abra-o e espere ficar verde.

### Conferir se as portas estão livres
```powershell
Get-NetTCPConnection -LocalPort 2345,8080 -State Listen -ErrorAction SilentlyContinue
```
Comando do Windows (não do Docker). Lista quem está **escutando** nas portas 2345 (DICOM) e 8080 (área web). Se aparecer algo, outro programa já usa a porta, por exemplo o receptor rodando com `npm start` num terminal. Pare-o com **Ctrl+C** naquele terminal antes de subir o Docker.

### Criar o arquivo de configuração
```powershell
copy .env.example .env
notepad .env
```
- `copy` faz uma cópia do modelo `.env.example` com o nome `.env`.
- `notepad .env` abre o arquivo para editar. Troque pelo menos o `ADMIN_PASSWORD`.

---

## 2. Subir o sistema

```powershell
docker compose up -d --build
```
O comando principal. Por partes:
- `docker compose up`: cria e liga todos os containers descritos no `docker-compose.yml`.
- `-d` (*detached*): roda **em segundo plano**, liberando o terminal. Sem ele, o terminal fica preso mostrando os logs, e o Ctrl+C derruba tudo.
- `--build`: **reconstrói as imagens** antes de subir. Use sempre que o código mudar. Se nada mudou, ele aproveita o que já foi construído e termina rápido.

Na primeira vez ele também cria a **rede** (para os containers se falarem) e o **volume** `vetus-dados`.

---

## 3. Conferir se está funcionando

### Ver os containers
```powershell
docker compose ps
```
Lista os containers do projeto. Na coluna STATUS:
- `Up ... (healthy)`: rodando e **saudável**. O Docker testa sozinho, de tempos em tempos, se o programa responde (o *healthcheck* definido no `Dockerfile`).
- `(health: starting)`: ainda iniciando; espere alguns segundos.
- `(unhealthy)` ou `Exited`: algo deu errado. Veja os logs (próximo comando).

A coluna PORTS mostra o redirecionamento, ex.: `0.0.0.0:2345->2345/tcp` quer dizer que a porta 2345 do PC vai para a 2345 do container.

### Ver os logs (o "console" do programa)
```powershell
docker compose logs receptor              # tudo o que o receptor escreveu até agora
docker compose logs -f receptor           # acompanhar ao vivo (Ctrl+C sai do log, o container continua rodando)
docker compose logs --tail 50 web         # só as últimas 50 linhas da área web
```
É aqui que aparecem as etapas `[RECEBENDO]`, `[PROCESSANDO]` e `[PRONTO]` quando o ultrassom envia um exame. O `-f` (*follow*) é o equivalente a deixar o terminal do `npm start` aberto.

### Testar a área web pelo terminal
```powershell
(Invoke-WebRequest http://localhost:8080/saude -UseBasicParsing).Content
```
- `Invoke-WebRequest` é o "navegador" do PowerShell: faz uma requisição HTTP.
- `/saude` é um endereço do Vetus que não pede login e responde `{"ok":true}` se a área web estiver de pé.
- `.Content` mostra só o texto da resposta.

No navegador: abra `http://localhost:8080` e entre com o `ADMIN_USER` e o `ADMIN_PASSWORD` do `.env`.

---

## 4. Uso do dia a dia

| Comando | O que faz |
|---|---|
| `docker compose stop` | **Pausa** os containers. Nada é apagado. |
| `docker compose start` | Liga de novo os containers pausados. |
| `docker compose restart receptor` | Reinicia só o receptor (ex.: se ele parecer travado). |
| `docker compose down` | **Para e remove** os containers e a rede. Os exames **continuam** no volume. |
| `docker compose up -d --build` | Sobe de novo; use também depois de atualizar o código (`git pull`). |

**Observação:** mudanças no `.env` só valem depois de `docker compose up -d`, porque o `restart` reaproveita as configurações antigas. O `up -d` percebe a mudança e recria só o container afetado.

Os containers estão com `restart: unless-stopped`: se o PC reiniciar, eles **voltam sozinhos** assim que o Docker Desktop abrir. Só não voltam se você os parou com `stop` ou `down`.

---

## 5. Os exames (volume `vetus-dados`)

No Docker, os exames **não** ficam em `C:\Git\SistemaVetus\dados`. Ficam no volume do Docker.

### Copiar os exames para uma pasta do Windows
```powershell
docker compose cp receptor:/data/temp .\dados-docker
explorer .\dados-docker
```
- `docker compose cp` copia arquivos **de dentro do container** para o PC (ou o contrário, invertendo a ordem).
- `receptor:/data/temp` quer dizer "a pasta `/data/temp` dentro do container `receptor`", que é onde o volume está montado.
- `explorer` abre a pasta no Windows Explorer.

### Ver os exames sem copiar
```powershell
docker compose exec receptor ls -la /data/temp
```
- `docker compose exec` **executa um comando dentro** de um container que está rodando.
- `ls -la` é o "dir" do Linux: lista os arquivos com detalhes.

### Entrar "dentro" do container (terminal Linux)
```powershell
docker compose exec receptor sh
```
Abre um terminal **dentro** do container. Útil para investigar. Digite `exit` para sair.

### Ver os volumes
```powershell
docker volume ls
```
Lista os volumes. O do Vetus aparece como `sistemavetus_vetus-dados` (o Docker põe o nome da pasta do projeto na frente).

### ⚠ Comando que apaga os exames
```powershell
docker compose down -v
```
O `-v` **apaga os volumes**, ou seja, **todos os exames recebidos**. Só use se quiser começar do zero.

---

## 6. Limpeza e espaço em disco

```powershell
docker system df          # quanto espaço imagens, containers e volumes estão ocupando
docker image prune        # apaga imagens antigas sem uso (sobram depois de vários --build)
```
O `prune` pede confirmação e **não** mexe em volumes, então os exames ficam seguros.

---

## 7. Configurar o ultrassom

Com os containers rodando, no Mindray (DICOM/HL7 → Definir serviço DICOM → Storage):

| Campo | Valor |
|---|---|
| Endereço IP | IP **deste PC** na rede (ex.: `192.168.0.86`) |
| Título AE | `MINIPACS` |
| Porta | `2345` |

O log do receptor mostra um IP como `172.19.0.2`: é o IP **interno** do container, não use esse no ultrassom. Use o IP do PC (veja com `ipconfig`).

Se o ultrassom não conseguir conectar, o **Firewall do Windows** pode estar bloqueando a porta 2345 para o Docker. Teste primeiro com o botão de teste de conexão (C-ECHO) do aparelho e acompanhe com `docker compose logs -f receptor`: deve aparecer `[ECHO]`.

---

## Resumo do mínimo para o dia a dia

```powershell
cd C:\Git\SistemaVetus
docker compose up -d --build        # subir (ou atualizar)
docker compose ps                   # está tudo healthy?
docker compose logs -f receptor     # acompanhar os exames chegando
docker compose down                 # desligar (exames mantidos)
```
