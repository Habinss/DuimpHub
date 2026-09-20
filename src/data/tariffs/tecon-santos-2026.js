// Published terminal price data, transcribed 2026-09-20. Never a live quote.
// Scope and interpretation are documented in docs/TARIFFS.md.
const source={title:'Tabela Pública de Preços Tecon Santos 2026',url:'https://www.santosbrasil.com.br/arq.asp?ID=1565',checkedAt:'2026-09-20'};
const row=(id,service,value,unit,period,note,extra={})=>({terminal:'tecon-santos',id,service,value,unit,period,validFrom:'2026-01-01',validTo:null,source,note,...extra});
export const TECON_SANTOS={
  id:'tecon-santos',terminal:'Tecon Santos',source,version:'2026-public-20260920',
  tariffs:[
    row('2.01','Armazenagem · dias 1 a 4',0.0098,'fração do CIF por contêiner','primeiro período de até 4 dias','Máximo entre percentual e mínimo individual.',{min20:2840.87,min40:3644.18}),
    row('2.02-2.04','Armazenagem · dias 5 a 7',0.0095,'fração do CIF por contêiner/dia','cada dia, cumulativo','Três períodos diários; máximo entre percentual e mínimo individual.',{min20:1159.79,min40:1484.53}),
    row('2.05','Armazenagem · dia 8 em diante',0.0108,'fração do CIF por contêiner/dia','cada dia, cumulativo','Quinto período e seguintes; máximo entre percentual e mínimo individual.',{min20:1319.08,min40:1691.89}),
    row('1.26','Handling in',610.07,'R$/contêiner/BL','por ocorrência','Incluir somente quando aplicável e confirmado.'),
    row('1.27','Handling out',610.07,'R$/contêiner/BL','por ocorrência','Incluir somente quando aplicável e confirmado.'),
    row('1.25','Scanner',840.37,'R$/contêiner','por ocorrência','Serviço de inspeção não invasiva; movimento separado quando aplicável.'),
    row('1.17','Pesagem',350.46,'R$/contêiner','por ocorrência','Somar movimentação 1.04 quando não incluída em outro serviço.'),
    row('1.04','Posicionamento / movimentação interna',699.73,'R$/contêiner/movimento','por ocorrência','Quantidade confirmada pelo usuário; não contar o mesmo movimento duas vezes.'),
    row('1.18','Monitoramento reefer',441.36,'R$/contêiner/dia ou fração','diário','Reefer normal, sem hot stuffing.'),
    row('1.20','Conexão reefer',102.58,'R$/contêiner','por conexão','Uma conexão por contêiner no cenário modelado.'),
    row('1.21','Desconexão reefer',102.58,'R$/contêiner','por desconexão','Uma desconexão por contêiner no cenário modelado.'),
    row('5.4','Adicional IMO',1,'fração adicional sobre serviços','por serviço','100% de acréscimo; combinações de adicionais exigem confirmação comercial.'),
    row('5.5','Adicional controle sanitário / Exército',1,'fração adicional sobre serviços','por serviço','100% de acréscimo quando o usuário confirma o enquadramento; não inferido pelo NCM.'),
    row('5.8','Adicional OOG / Flat Rack / Open Top',2,'fração adicional sobre serviços','por serviço','200% de acréscimo; combinações de adicionais exigem confirmação comercial.')
  ]
};
