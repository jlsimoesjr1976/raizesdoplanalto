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
  const marginX = 16
  const marginTop = 12
  const pageWidth = doc.internal.pageSize.getWidth()
  const usableWidth = pageWidth - marginX * 2
  // Espaçamentos compactos para caber em uma única página A4
  const LH = 3.9          // altura de linha de parágrafo
  const PARA_GAP = 1.4    // espaço após parágrafo
  let y = marginTop

  function title(text: string) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
    const lines = doc.splitTextToSize(text, usableWidth)
    doc.text(lines, pageWidth / 2, y, { align: 'center' })
    y += lines.length * 5 + 2
  }

  function heading(text: string) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    y += 1.2
    doc.text(text, marginX, y)
    y += 4
  }

  function paragraph(text: string, opts: { bold?: boolean } = {}) {
    doc.setFont('helvetica', opts.bold ? 'bold' : 'normal')
    doc.setFontSize(8.7)
    const lines = doc.splitTextToSize(text, usableWidth)
    doc.text(lines, marginX, y, { align: 'justify', maxWidth: usableWidth })
    y += lines.length * LH + PARA_GAP
  }

  title('CONTRATO DE PRESTAÇÃO DE SERVIÇOS DE FREELANCER')
  y += 1

  paragraph(
    `CONTRATANTE: ${contratante.nome}, CNPJ/CPF: ${contratante.documento}, com sede em ${contratante.endereco}, doravante denominada simplesmente CONTRATANTE.`
  )
  paragraph(
    `CONTRATADO(A): ${c.nome}, ${c.profissao}, CPF: ${c.cpf}, RG: ${c.rg}, residente e domiciliado(a) em ${c.endereco}, doravante denominado(a) simplesmente CONTRATADO(A).`
  )

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

  heading('CLÁUSULA QUARTA – DA AUSÊNCIA DE VÍNCULO EMPREGATÍCIO')
  paragraph('4.1. Este contrato é de natureza estritamente civil, não gerando qualquer tipo de vínculo empregatício (CLT) entre o(a) CONTRATADO(A) e a CONTRATANTE, ficando esta isenta de obrigações trabalhistas, previdenciárias ou sindicais.')
  paragraph('4.2. O(A) CONTRATADO(A) possui total autonomia para aceitar ou recusar convites para dias futuros.')

  heading('CLÁUSULA QUINTA – DA RESCISÃO E AUSÊNCIA DE MULTA')
  paragraph(`5.1. O presente contrato poderá ser rescindido ou cancelado por qualquer uma das partes, sem a incidência de multa rescisória, mediante aviso prévio de, no mínimo, ${c.avisoPrevio} horas de antecedência.`)

  y += 1
  paragraph('E, por estarem assim justos e contratados, assinam o presente instrumento em duas vias de igual teor e forma.')
  paragraph(`${contratante.cidadeUf}, ${c.dataAssinatura}.`)

  // Bloco de assinaturas
  y += 12
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
