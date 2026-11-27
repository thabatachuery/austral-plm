# Pedido ao BI — grade por tamanho no `/pedidos-produto`

**Para:** equipe do BI (serviço `bi.austral.com.br/api/linx`)
**Por quê:** a explosão de aviamentos de produção do PLM calcula as etiquetas de
tamanho (uma etiqueta por tamanho: PP, P, M, G, GG…). Cada pedido de produção
tem uma grade própria, mas hoje o `/pedidos-produto` devolve só o total do pedido
por cor. Sem a grade, o PLM conta o pedido inteiro para cada tamanho: um pedido de
300 peças vira 300 etiquetas P, 300 etiquetas M, 300 etiquetas G e assim por diante.

## O que muda

Basta acrescentar dois campos ao que o endpoint já devolve. Nada sai e nada muda
de nome:

```json
{
  "produto_pai": "21080021",
  "cor": "C07",
  "numero_pedido": "00003715",
  "quantidade": 305,
  "quantidade_pendente": 305,
  "data_programada": "2026-09-28",
  "situacao": "EM ABERTO",
  "fornecedor": "HONGKONG CH COMPANY",
  "tipo_compra": "PRODUÇÃO",

  "grade": "PP AO GG",
  "tamanhos": { "PP": 20, "P": 60, "M": 100, "G": 85, "GG": 40 }
}
```

| campo       | conteúdo | observação |
|-------------|----------|------------|
| `grade`     | nome da grade do produto | mesma chave usada no `/tamanhos` |
| `tamanhos`  | `{ rótulo do tamanho: quantidade pendente }` | rótulos iguais aos do `/tamanhos` para essa grade; a soma deve bater com `quantidade_pendente` |

Se for mais simples, também serve devolver `quantidade_por_posicao: [20, 60, 100, 85, 40]`
(posição 1..n da grade, igual ao `est_1..est_6` do `/estoque`). O PLM converte
para rótulo pelo `/tamanhos`.

## Origem sugerida (Linx ERP)

As quantidades por tamanho do pedido ficam nas colunas por posição da linha do
pedido (`COMPRAS_PRODUTO`: quantidade original e quantidade já entregue por
posição de grade). O pendente de cada posição é *original − entregue*. A grade
vem de `PRODUTOS.GRADE`.

> Os nomes de coluna variam por versão do Linx. Confirmem na base de vocês. O que
> importa é o contrato da resposta.

## Requisitos

- Mesma autenticação (`X-API-Key`), mesmo filtro (só linhas com saldo pendente > 0).
- Atualizar a descrição no `/openapi.json`.

## Do lado do PLM

Quando os campos existirem, a explosão de produção passa a multiplicar cada
etiqueta de tamanho só pela quantidade daquele tamanho nos pedidos pendentes da
variante, em vez do total do pedido.
