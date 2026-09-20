// Fixtures are never tagged REAL, never depend on MCP, and never infer official releases.
export const DEMO_OPERATION={
  ncm:'30049099',descricao:'Medicamentos · lote hospitalar de demonstração',escala:'4 contêineres de 40 pés',containers20:0,containers40:4,
  urgencia:'Crítica',anuencia_prevista:'Sim',orgao_anuente:'ANVISA',pendencia:'Sim',pendencia_tipo:'documental-demo',logistica:'Sim',transporte:'Sim',janela:'Sim',entreposto:'Não',preparacao:'Alta',
  terminal:'tecon-santos',entryDate:'2026-09-20',cif:800000,daysDireta:2,daysRecinto:8,cargoType:'house',reefer:true,hotStuffing:false,imo:false,oog:false,sanitary:true,inspection:false,inspectionConfirmed:true,
  handlingIn:4,handlingOut:4,scanner:4,weighing:4,moves:4,movesConfirmed:true,equalCifConfirmed:true
};
export const DEMO_DOCUMENTS=[
  {name:'invoice_demo.txt',type:'Invoice',text:'DEMO — DOCUMENTO FICTÍCIO\nCommercial Invoice: INV-DEMO-2409\nImportador: Importadora Demo Ltda.\nMercadoria: Medicamentos · lote hospitalar de demonstração\nNCM: 30049099\nCIF total: R$ 800.000,00\n'},
  {name:'packing_list_demo.txt',type:'Packing List',text:'DEMO — DOCUMENTO FICTÍCIO\nPacking List: PL-DEMO-2409\nNCM: 30049099\nEscala: 4 contêineres de 40 pés\n12 volumes\nPeso: 486 kg\n'}
];
