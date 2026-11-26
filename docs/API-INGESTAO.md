# Contrato da API de ingestão — versão 1

Fonte da verdade para quem envia exames ao AutoLaudoVet: apps de envio (Windows/Android, repositório `vetus-apps`) e o
receptor DICOM da nuvem (repositório `dgaz-vetus-receptor-dicom-claud`). Mudou o contrato? Esta plataforma atualiza este
documento e a versão; os outros repositórios seguem. Plano: [PLANO-INGESTAO.md](PLANO-INGESTAO.md).

- Base: `https://<servidor>/api/ingestao/v1` (só HTTPS em produção; na rede interna do Docker: `http://plataforma:8080/...`).
- Erros: sempre JSON `{ "erro": "mensagem em português" }` com o código HTTP correspondente.
- Interruptor de emergência: com `INGESTAO_HABILITADA=false` no servidor, tudo responde `503`.

## 1. Autenticação

Todas as chamadas (menos `/parear`) levam o token do dispositivo:

```
Authorization: Bearer <token de 64 caracteres>
X-Versao-App: 1.4.0          (opcional: aparece na tela da clínica)
```

| Quem | Como consegue o token | Clínica |
|---|---|---|
| App Windows/Android | Pareamento por código (seção 2) | A do pareamento (vem do token) |
| Receptor DICOM da nuvem | Token de serviço criado em "Receptores (sistema)" e posto no `.env` do receptor | A dona do AE Title chamado, informado em todo pedido no cabeçalho `X-AE-Chamado` |

- Token inválido ou revogado: `401`. Clínica inativa: `403`. Receptor sem `X-AE-Chamado`: `400`; AE desconhecido: `404`.
- A clínica **nunca** vem do corpo do pedido.
- Limite: 1200 pedidos por minuto por token (`429` acima disso; espere e repita).

## 2. Pareamento do app

O administrador da clínica gera o código em **Configurações da clínica → Aparelhos e apps** (8 caracteres, vale 10 minutos,
uso único).

```
POST /parear
{ "codigo": "K7QM-2XRP", "versaoApp": "1.0.0" }

200 { "token": "<64 caracteres>",
      "dispositivo": { "id": "...", "nome": "Notebook da Dra. Ana", "tipo": "windows" },
      "clinica": { "id": "...", "nome": "Clínica X" } }
401 código inválido, vencido ou já usado
429 tentativas demais (10 por minuto por IP)
```

O app guarda o token no cofre do sistema (Gerenciador de Credenciais do Windows / Keystore do Android) e nunca o mostra.

```
GET /eu      → 200 { "dispositivo": {...}, "clinica": { "id", "nome", "aeTitle" } }
```

## 3. Identificação do exame

Igual ao pendrive do Mindray (é o que junta o mesmo exame vindo por caminhos diferentes):

- `idAnimal`: `AAAAMMDD-HHMMSS-XXXX` (ID do paciente no aparelho; ex.: `20261105-083824-3E0C`).
  Do DICOM: `PatientID (0010,0020)`.
- `subpasta`: `TIPO` (2 a 5 letras: `ABD`, `REP`, `SMP`…) + data e hora do exame `AAAAMMDDHHMMSS`
  (ex.: `ABD20261105083833`). Do DICOM: tipo pelo protocolo/descrição do estudo (padrão `ABD`) + `StudyDate`+`StudyTime`.

O mesmo `idAnimal` + data/hora já recebido (por DICOM, pendrive ou outro app) é **o mesmo exame**: os arquivos se juntam.

## 4. Envio (retomável e sem duplicar)

### 4.1 O que já chegou
```
POST /exames/verificar
{ "exames": [ { "idAnimal": "20261105-083824-3E0C", "subpasta": "ABD20261105083833" } ] }   (até 200)

200 [ { "idAnimal": "...", "subpasta": "...",
        "recebidos": [ { "nome": "IMG001.jpg", "tamanho": 183422 } ],
        "exame": null | { "id": "...", "status": "NaFila" } } ]
```
Mande só os arquivos que não estão em `recebidos` (ou com tamanho diferente).

### 4.2 Um arquivo
```
PUT /exames/{idAnimal}/{subpasta}/arquivos/{nome}
Content-Type: application/octet-stream
X-SHA1: <SHA-1 em hexadecimal do arquivo>   (recomendado: o servidor confere)
<corpo = o arquivo>

200 { "nome": "IMG001.jpg", "tamanho": 183422 }
400 nome/extensão não aceitos, arquivo vazio, SHA-1 não confere (envie de novo)
413 grande demais
```
- Aceitos: `.jpg`/`.jpeg` (fotos), `.pdf` (relatório do aparelho), `.mp4` (vídeos). Nome: letras, números, `- _ # . ( )` e
  espaço, até 120 caracteres; sem `/`, `\` ou `..`.
- Máximo: 25 MB por foto/PDF, 500 MB por vídeo.
- Reenviar o mesmo nome substitui (idempotente). Um envio interrompido não deixa arquivo pela metade.
- Ordem sugerida: o PDF do aparelho, as fotos, e os vídeos por último.

### 4.3 Concluir
```
POST /exames/{idAnimal}/{subpasta}/concluir
{ "nome": "Thor" }        (opcional: nome do animal, se não houver PDF do aparelho)

200 { "exame": { "id": "...", "status": "NaFila" | "AguardandoDados", "origem": "app" | "dicom+app" },
      "novo": true, "paciente": "Thor", "fotos": 12, "pdfs": 1, "videos": 0, "relatorioLido": true, "medidas": 8 }
400 nenhuma foto nem PDF; PDF de outro animal
```
- Lê o PDF do aparelho (paciente, responsável, medidas, comentários), cria o exame ou junta com o existente, registra a
  atividade e coloca na fila da IA se a clínica gera automaticamente.
- Pode chamar de novo depois de mandar mais arquivos (ex.: vídeos): atualiza o mesmo exame.

### 4.4 Situação na nuvem
```
GET /exames/{idAnimal}/{subpasta}
200 { "id": "...", "status": "AguardandoRevisao", "assinado": false }
404 ainda não recebido
```
Situações: `AguardandoDados`, `NaFila`, `Gerando`, `AguardandoRevisao`, `Pronto` (assinado), `Erro`.

## 5. Boas práticas do cliente

- Fila local: guarde o exame até o `concluir` responder `200`; se a internet cair, recomece pelo `verificar`.
- Retente com espera crescente (5 s, 30 s, 2 min…) em erros de rede, `429` e `5xx`; não retente `400`/`401`/`403`/`413`.
- `401`: o app foi revogado ou o token não vale mais → peça um novo pareamento.
- Não guarde dados de paciente além do necessário para a fila; apague os arquivos locais depois do `concluir` (ou após o prazo
  que a clínica escolher).

## Histórico

- **v1** (26/11/2026): pareamento, verificar, arquivo, concluir, situação; token por dispositivo; receptor com `X-AE-Chamado`.
