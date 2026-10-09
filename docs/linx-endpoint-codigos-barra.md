# Pedido ao BI — endpoint `/codigos-barra` na Linx API

**Para:** equipe do BI (serviço `bi.austral.com.br/api/linx`)
**Por quê:** o PLM precisa do EAN de cada SKU (ref × cor × tamanho) para preencher
listas em Excel e, depois, mostrar nas variantes/fichas/etiquetas. Hoje nenhum
endpoint da API traz código de barras.

## Contrato

```
GET /codigos-barra
    ?produtos=21030063,11030104     (opcional — vazio = todos)
    header X-API-Key                 (mesma chave dos outros endpoints)
```

Resposta — uma linha por código de barras cadastrado:

```json
[
  {
    "produto_pai": "21030063",
    "cor": "0010",
    "posicao": 2,
    "tamanho": "M",
    "codigo_barra": "7891234567895",
    "padrao": true
  }
]
```

| campo          | origem sugerida (Linx ERP)            | observação |
|----------------|----------------------------------------|------------|
| `produto_pai`  | `PRODUTOS_BARRA.PRODUTO`               | com `RTRIM`, igual ao `/estoque` |
| `cor`          | `PRODUTOS_BARRA.COR_PRODUTO`           | mesmo código usado em `/cores` |
| `posicao`      | `PRODUTOS_BARRA.TAMANHO`               | posição 1..6 na grade (casa com `est_1..est_6`) |
| `tamanho`      | `PRODUTOS_BARRA.GRADE`                 | rótulo do tamanho (P, M, 38…) |
| `codigo_barra` | `PRODUTOS_BARRA.CODIGO_BARRA`          | texto, sem converter para número (zero à esquerda) |
| `padrao`       | `PRODUTOS_BARRA.CODIGO_BARRA_PADRAO`   | o mesmo SKU pode ter mais de um código; este marca o oficial |

> Os nomes de tabela/coluna são os usuais do Linx ERP — confirmem na base de vocês.
> O que importa é o contrato da resposta.

## SQL de referência

```sql
SELECT RTRIM(b.PRODUTO)      AS produto_pai,
       RTRIM(b.COR_PRODUTO)  AS cor,
       b.TAMANHO             AS posicao,
       RTRIM(b.GRADE)        AS tamanho,
       RTRIM(b.CODIGO_BARRA) AS codigo_barra,
       CAST(ISNULL(b.CODIGO_BARRA_PADRAO, 0) AS bit) AS padrao
FROM PRODUTOS_BARRA b
WHERE (@produtos IS NULL OR RTRIM(b.PRODUTO) IN (SELECT value FROM STRING_SPLIT(@produtos, ',')))
ORDER BY b.PRODUTO, b.COR_PRODUTO, b.TAMANHO, padrao DESC;
```

## Requisitos

- Mesma autenticação (`X-API-Key`) e mesmo tratamento de erro dos outros endpoints.
- Sem paginação está ok (o volume é da ordem de ref × cor × tamanho).
- Documentar no `/openapi.json` como os demais.

## Do lado do PLM

Já pronto: `npm run linx:ean -- lista.xlsx` lê a lista de refs e gera o Excel com
o EAN de cada SKU (`scripts/ean-linx.mjs`). Enquanto o endpoint não existir, o
script avisa que o `/codigos-barra` ainda não foi publicado.
