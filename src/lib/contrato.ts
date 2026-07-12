import { jsPDF } from 'jspdf'

export interface ContratanteData {
  nome: string        // Razão social ou nome de exibição
  documento: string   // CNPJ (mascarado)
  endereco: string    // Endereço completo
  cidadeUf: string    // "Cidade - UF"
}

export interface ContratoData {
  // Contratado (freelancer)
  nome: string
  profissao: string
  cpf: string         // mascarado
  rg: string
  endereco: string
  funcao: string
  // MEI (quando o freelancer é Microempreendedor Individual)
  isMei?: boolean
  cnpj?: string         // mascarado
  razaoSocial?: string  // razão social da MEI
  // Pagamento
  pixKey?: string
  // Execução
  data: string
  horaInicio: string
  horaFim: string
  // Pagamento
  valor: string       // ex: "180,00"
  formaPagamento: string
  // Rescisão
  avisoPrevio: string // ex: "24"
  // Assinatura
  dataAssinatura: string
}

function fmtValor(v: string) {
  return v.trim()
}

export function gerarContratoPdf(contratante: ContratanteData, c: ContratoData): jsPDF {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  const marginX = 18
  const marginTop = 16
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const usableWidth = pageWidth - marginX * 2
  const LH = 4.2          // altura de linha de parágrafo
  const PARA_GAP = 1.8    // espaço após parágrafo
  let y = marginTop

  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - marginTop) {
      doc.addPage()
      y = marginTop
    }
  }

  function title(text: string) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12.5)
    const lines = doc.splitTextToSize(text, usableWidth)
    doc.text(lines, pageWidth / 2, y, { align: 'center' })
    y += lines.length * 5.5 + 3
  }

  function heading(text: string) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    ensureSpace(10)
    y += 2
    doc.text(text, marginX, y)
    y += 4.5
  }

  function paragraph(text: string) {
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9.5)
    const lines = doc.splitTextToSize(text, usableWidth)
    ensureSpace(lines.length * LH + PARA_GAP)
    doc.text(lines, marginX, y, { align: 'justify', maxWidth: usableWidth })
    y += lines.length * LH + PARA_GAP
  }

  const comarca = (contratante.cidadeUf.split(' - ')[0] || 'Brasília').trim()

  title('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FREELANCER')
  y += 1

  paragraph(
    `CONTRATANTE: ${contratante.nome}, CNPJ/CPF: ${contratante.documento}, com sede em ${contratante.endereco}, doravante denominada simplesmente CONTRATANTE.`
  )
  if (c.isMei && c.cnpj) {
    const razao = c.razaoSocial && c.razaoSocial.trim() ? c.razaoSocial.trim() : c.nome
    paragraph(
      `CONTRATADO(A): ${razao}, ${c.profissao}, pessoa jurídica na modalidade Microempreendedor Individual (MEI), inscrita no CNPJ sob o nº ${c.cnpj}, neste ato representada por ${c.nome}, CPF nº ${c.cpf}, RG nº ${c.rg}, com sede e/ou residência em ${c.endereco}, doravante denominado(a) simplesmente CONTRATADO(A).`
    )
  } else {
    paragraph(
      `CONTRATADO(A): ${c.nome}, ${c.profissao}, CPF: ${c.cpf}, RG: ${c.rg}, residente e domiciliado(a) em ${c.endereco}, doravante denominado(a) simplesmente CONTRATADO(A).`
    )
  }

  heading('CLÁUSULA PRIMEIRA – DO OBJETO')
  paragraph(
    `O presente contrato tem por objeto a prestação de serviços por parte do(a) CONTRATADO(A) na função de ${c.funcao}, para atuar durante eventos ou dias de pico de movimento da CONTRATANTE.`
  )

  heading('CLÁUSULA SEGUNDA – DA EXECUÇÃO DOS SERVIÇOS E PRAZO')
  paragraph(`2.1. Os serviços serão prestados na data de ${c.data}, das ${c.horaInicio} às ${c.horaFim}.`)
  paragraph('2.2. O local de prestação dos serviços será no estabelecimento da CONTRATANTE, localizado no endereço citado acima.')
  paragraph('2.3. O(A) CONTRATADO(A) compromete-se a executar os serviços com zelo, cordialidade e seguindo as normas de higiene, vestimenta e atendimento do estabelecimento.')

  heading('CLÁUSULA TERCEIRA – DO VALOR E DA FORMA DE PAGAMENTO')
  paragraph(`3.1. Pelos serviços prestados, a CONTRATANTE pagará ao(à) CONTRATADO(A) o valor total de R$ ${fmtValor(c.valor)} por diária/evento.`)
  paragraph(`3.2. O pagamento será realizado no ${c.formaPagamento}, mediante a assinatura de recibo ou confirmação de quitação.`)
  if (c.pixKey && c.pixKey.trim()) {
    paragraph(`3.3. Fica estabelecido que o pagamento será efetuado por meio de transferência PIX para a chave ${c.pixKey.trim()}, de titularidade do(a) CONTRATADO(A).`)
  }

  heading('CLÁUSULA QUARTA – DAS DISPOSIÇÕES GERAIS')
  paragraph('Fica pactuada a total inexistência de vínculo trabalhista entre as partes, não havendo entre o FREELANCER e CONTRATANTE qualquer tipo de relação de subordinação.')
  paragraph('A contratação do freelancer, cumpridas todas as formalidades legais, com ou sem exclusividade, de forma contínua ou não, afasta a qualidade de empregado prevista no art. 3º da CLT, nos termos do art. 442-B da CLT.')
  paragraph('A tolerância, por qualquer das partes, com relação ao descumprimento de qualquer termo ou condições aqui ajustadas, não será considerada como desistência em exigir o cumprimento de disposição nele contida, nem representará novação com relação a obrigação passada, presente ou futura, no tocante ao termo ou condição cujo descumprimento foi tolerado.')

  heading('CLÁUSULA QUINTA – DAS OBRIGAÇÕES DO FREELANCER')
  paragraph('O freelancer, por seus prepostos ou terceirizados, atuará estritamente para o cumprimento dos serviços solicitados pela CONTRATANTE, sendo vedada a comercialização ou utilização para outros fins.')
  paragraph('Será de responsabilidade do freelancer todo o ônus trabalhista ou tributário referente aos serviços, bem como aos terceirizados utilizados para a prestação do serviço objeto deste instrumento, ficando a CONTRATANTE isenta de qualquer obrigação em relação a eles.')
  paragraph('O freelancer é responsável pelo pagamento dos impostos e contribuições fiscais que possam recair sobre o serviço objeto do presente instrumento.')

  heading('CLÁUSULA SEXTA – DA CESSÃO DE DIREITOS AUTORAIS')
  paragraph('Pelo presente contrato, o FREELANCER cede em favor do CONTRATANTE, com exclusividade, a totalidade dos direitos autorais de todo o trabalho desenvolvido em razão do presente contrato, podendo o CONTRATANTE editar, transformar, revender, replicar e alterar.')
  paragraph('O FREELANCER declara ser titular originário e exclusivo dos trabalhos entregues.')

  heading('CLÁUSULA SÉTIMA – DO SIGILO E CONFIDENCIALIDADE')
  paragraph('Os contratantes declaram expressamente manter sigilo, tanto escrito como verbal, ou por qualquer outra forma, de todos os dados, informações pessoais e profissionais relacionados ao presente contrato, não podendo revelar, reproduzir, utilizar ou dar conhecimento, em hipótese alguma, a terceiros, de dados ou informações obtidas por força deste contrato, sem a prévia autorização da outra parte.')

  heading('CLÁUSULA OITAVA – DA RESCISÃO E AUSÊNCIA DE MULTA')
  paragraph(`8.1. O presente contrato poderá ser rescindido ou cancelado por qualquer uma das partes, sem a incidência de multa rescisória, mediante aviso prévio de, no mínimo, ${c.avisoPrevio} horas de antecedência.`)

  heading('CLÁUSULA NONA – DO FORO')
  paragraph(`Para dirimir quaisquer controvérsias oriundas do presente contrato, as partes elegem o foro da comarca de ${comarca}.`)

  y += 2
  paragraph('E, por estarem assim justos e contratados, assinam o presente instrumento em duas vias de igual teor e forma.')
  paragraph(`${contratante.cidadeUf}, ${c.dataAssinatura}.`)

  // Bloco de assinaturas
  y += 14
  ensureSpace(34)
  const colW = usableWidth / 2
  const line1X = marginX + colW / 2
  const line2X = marginX + colW + colW / 2

  doc.setDrawColor(60)
  doc.line(marginX + 8, y, marginX + colW - 8, y)
  doc.line(marginX + colW + 8, y, marginX + usableWidth - 8, y)
  y += 5
  doc.setFontSize(9.5)
  doc.setFont('helvetica', 'bold')
  doc.text(contratante.nome, line1X, y, { align: 'center', maxWidth: colW - 6 })
  doc.text(c.nome, line2X, y, { align: 'center', maxWidth: colW - 6 })
  y += 5
  doc.setFont('helvetica', 'normal')
  doc.text(`CNPJ: ${contratante.documento}`, line1X, y, { align: 'center' })
  doc.text(`CPF: ${c.cpf}`, line2X, y, { align: 'center' })
  y += 5
  doc.setFontSize(8.5)
  doc.setTextColor(100)
  doc.text('(Assinatura do Contratante)', line1X, y, { align: 'center' })
  doc.text('(Assinatura do Contratado)', line2X, y, { align: 'center' })
  doc.setTextColor(0)

  return doc
}
