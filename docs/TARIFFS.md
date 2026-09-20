# Escopo do subtotal e fonte dos parâmetros

Fonte primária: [Tabela Pública de Preços Tecon Santos 2026](https://www.santosbrasil.com.br/arq.asp?ID=1565), acessada pelo [site do terminal](https://www.santosbrasil.com.br/v2021/conteineres) em 20/09/2026. Foram conferidos os valores e as notas relevantes do PDF, inclusive visualmente. A vigência publicada inicia em 01/01/2026; o catálogo não presume uma data final oficial. Como limite conservador do MVP, datas posteriores à conferência não são precificadas sem nova verificação.

Os números cadastrados são dados de tabela, não uma cotação. A interpretação de aplicabilidade precisa ser confirmada pelo responsável e pelo terminal.

## Cobertura implementada

Importação house FCL, um BL por contêiner, descarga no próprio Tecon Santos, sem mudança de regime. Os dois cenários usam **a mesma modalidade e terminal**, com permanências informadas pelo usuário. O comparador não trata o rótulo operacional “retirada direta” como o serviço tarifário de descarga direta nem calcula transferência física a outro recinto.

Armazenagem usa o maior entre percentual do CIF e mínimo individual por contêiner/tamanho. O primeiro período cobre até quatro dias; os demais são diários e cumulativos. As ocorrências de handling, scanner, pesagem e movimentação são informadas explicitamente. Reefer normal inclui monitoramento diário e uma conexão/desconexão. Tributos sobre os serviços são excluídos, de acordo com a observação geral 5.1.

## Validação dos parâmetros

- Quantidade e tamanho dos contêineres: TEU isolado não define a distribuição 20/40. Carga solta, toneladas e navio não viram contêineres automaticamente.
- CIF em reais: sem câmbio inferido. Valores individuais devem somar o total; rateio igual exige confirmação do usuário. Ordem da lista: contêineres de 20 pés e depois de 40 pés.
- Dias são arredondados para cima, com limite de modelagem de 365 dias. Não há hipótese silenciosa de permanência.
- Serviços: quantidades totais por cenário, iguais para ambos; zero significa serviço não selecionado. Scanner e pesagem exigem confirmação dos movimentos e da ausência de duplicidade.
- IMO, controle sanitário/Exército e OOG são enquadramentos explicitamente informados. Nenhum adicional é inferido automaticamente do NCM. Combinações de adicionais bloqueiam a estimativa para conferência comercial.
- Hot stuffing, outra modalidade, outra origem de descarga, múltiplos BLs ou regime especial ficam fora do escopo modelado. Não é aplicada aproximação genérica.

## Auditoria

`src/data/tariffs/tecon-santos-2026.js` guarda terminal, serviço, item, valor, unidade, período, vigência, fonte e observação. `src/engine/costs.js` calcula por contêiner e retorna cada parcela e fórmula. A interface e a exportação usam o mesmo resultado do motor. Os casos de teste verificam mínimos, CIF alto, mudança de período, contêineres mistos, adicionais e insuficiência de dados com valores esperados independentes.

O termo usado é **Subtotal logístico-operacional estimado**. Não inclui mercadoria, tributos, frete internacional, seguro, câmbio, demurrage/detention, transporte rodoviário externo, despachante, serviços sob consulta e valores não cadastrados. Não é custo total da importação.
