# Pedido ao BI — endpoint `/vendas` na Linx API

**Para:** equipe do BI (serviço `bi.austral.com.br/api/linx`)
**Por quê:** o PLM ganhou as telas **Ranking de Vendas** e **Ranking de Estoque**
(menu lateral, abaixo de Calendário). Elas já leem estoque, pedidos e cadastro
pela API, mas venda não existe em nenhum endpoint — o painel do BI tem esses
números, só não os publica na API. Assim que o `/vendas` existir, as telas
passam a mostrar a venda sem nenhuma mudança no PLM.

## Contrato

```
GET /vendas
    ?de=2026-10-01      (obrigatório — data inicial, inclusiva, AAAA-MM-DD)
    &ate=2026-10-31     (obrigatório — data final, inclusiva)
    header X-API-Key    (mesma chave dos outros endpoints)
```

Resposta — venda **somada no período** por referência × cor × filial
(uma linha por combinação que vendeu alguma coisa):

```json
[
  { "produto_pai": "21080008", "cor": "C02", "filial": "LOJA IGUATEMI SP", "quantidade": 7, "valor": 6993.00 }
]
```

| campo         | observação |
|---------------|------------|
| `produto_pai` | com `RTRIM`, igual ao `/estoque` |
| `cor`         | mesmo código do `/estoque` e do `/cores` |
| `filial`      | mesmo nome de filial do `/estoque` (é o que casa venda × estoque por loja) |
| `quantidade`  | peças vendidas **líquidas de devolução/troca** (pode sair negativo) |
| `valor`       | opcional — valor líquido vendido em R$ |

Mesma regra de venda que o painel do BI já usa (lojas próprias, franquias,
e-commerce e atacado — o que o painel considera venda). O PLM só soma.

## Requisitos

- Mesma autenticação (`X-API-Key`) e mesmo tratamento de erro dos outros endpoints.
- Sem paginação (volume ≈ ref × cor × filial do período).
- Documentar no `/openapi.json` como os demais.

## Do lado do PLM

Já pronto: `lib/linx.ts` (`getVendas`) e `app/api/linx/ranking/route.ts`.
Enquanto o endpoint responder 404, as telas avisam "vendas aguardando o BI".
