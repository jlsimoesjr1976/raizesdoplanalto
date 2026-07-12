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
  // Valor
  valor: string       // ex: "180,00"
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
  const LH = 4.2
  const PARA_GAP = 1.8
  let y = marginTop

  function ensureSpace(needed: number) {
    if (y + needed > pageHeight - marginTop) {
      doc.addPage()
      y = marginTop
    }
  }

  function title(text: string) {
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(12)
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

  title('Contrato de Prestação Eventual de Serviços Autônomos para Evento Específico')
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
  paragraph('O presente contrato tem por objeto a prestação eventual, autônoma e sem vínculo empregatício de serviços de apoio operacional em bar/bartender, exclusivamente para o evento ou dia de movimento específico indicado neste instrumento, sem garantia de continuidade, habitualidade, exclusividade ou convocação futura.')
  paragraph('O(A) CONTRATADO(A) atuará com autonomia técnica na execução dos serviços contratados, observadas apenas as normas gerais de segurança, higiene, atendimento ao público e funcionamento do estabelecimento, sem subordinação jurídica, controle de jornada ou inserção na estrutura permanente da CONTRATANTE.')

  heading('CLÁUSULA SEGUNDA – DA EXECUÇÃO DOS SERVIÇOS')
  paragraph(`2.1. Os serviços serão prestados no dia ${c.data}, durante o período estimado das ${c.horaInicio} às ${c.horaFim}, exclusivamente em razão da demanda pontual do evento/data específica.`)
  paragraph('2.2. O período acima não caracteriza jornada de trabalho, controle de ponto ou escala fixa, tratando-se apenas da janela operacional necessária para a realização do serviço contratado.')
  paragraph('2.3. O(A) CONTRATADO(A) declara possuir experiência, capacidade técnica e autonomia para a execução dos serviços, responsabilizando-se pela forma de execução, conduta profissional e qualidade do serviço prestado.')
  paragraph('2.4. A presente contratação não gera obrigação de convocação futura pela CONTRATANTE, nem obrigação de aceitação de novas demandas pelo(a) CONTRATADO(A).')

  heading('CLÁUSULA TERCEIRA – DO VALOR, PAGAMENTO E QUITAÇÃO')
  paragraph(`3.1. Pela prestação dos serviços autônomos descritos neste instrumento, a CONTRATANTE pagará ao(à) CONTRATADO(A) o valor total de R$ ${fmtValor(c.valor)} pela diária/evento.`)
  paragraph(`3.2. O pagamento será realizado via PIX${c.pixKey && c.pixKey.trim() ? `, para a chave ${c.pixKey.trim()},` : ''} no dia útil seguinte à prestação dos serviços, mediante recibo ou confirmação eletrônica de quitação.`)
  paragraph('3.3. O valor contratado remunera integralmente os serviços prestados no evento/data específica, não possuindo natureza salarial e não gerando férias, 13º salário, FGTS, aviso prévio, horas extras, adicional noturno, DSR ou qualquer verba típica de relação empregatícia.')
  paragraph('3.4. O(A) CONTRATADO(A) será responsável por seus próprios tributos, contribuições, encargos e obrigações fiscais eventualmente incidentes sobre os valores recebidos.')

  heading('CLÁUSULA QUARTA – DA NATUREZA AUTÔNOMA DA CONTRATAÇÃO')
  paragraph('4.1. As partes reconhecem que a presente contratação possui natureza civil/autônoma, eventual e específica, inexistindo relação de emprego entre CONTRATANTE e CONTRATADO(A).')
  paragraph('4.2. Não haverá subordinação jurídica, controle de jornada, exclusividade, habitualidade obrigatória, salário mensal, dependência econômica presumida ou integração do(a) CONTRATADO(A) ao quadro permanente da CONTRATANTE.')
  paragraph('4.3. O(A) CONTRATADO(A) poderá prestar serviços a terceiros, inclusive no mesmo ramo de atividade, inexistindo qualquer obrigação de exclusividade.')
  paragraph('4.4. A eventual contratação do(a) CONTRATADO(A) em outras datas dependerá de novo ajuste entre as partes, verbal ou escrito, sempre para demandas específicas e pontuais, não caracterizando continuidade obrigatória ou vínculo empregatício.')

  heading('CLÁUSULA QUINTA – DA POSSIBILIDADE DE SUBSTITUIÇÃO')
  paragraph('O(A) CONTRATADO(A) poderá indicar profissional substituto para a execução dos serviços, desde que informe previamente a CONTRATANTE e que o substituto possua qualificação compatível, documentação regular e aceite as normas mínimas de higiene, segurança e atendimento do estabelecimento.')
  paragraph('A aprovação prévia do substituto pela CONTRATANTE terá finalidade exclusivamente operacional, sanitária e de segurança, não caracterizando pessoalidade típica de relação empregatícia.')

  heading('CLÁUSULA SEXTA – DA RESPONSABILIDADE DO(A) CONTRATADO(A)')
  paragraph('O(A) CONTRATADO(A) responderá por danos materiais causados por dolo, culpa grave, imprudência, negligência ou imperícia na execução dos serviços, incluindo danos a equipamentos, utensílios, bebidas, mercadorias, comandas, sistemas, clientes, colaboradores ou terceiros.')
  paragraph('O(A) CONTRATADO(A) compromete-se a observar as normas de higiene, segurança alimentar, conduta profissional, cordialidade no atendimento, vedação ao consumo de bebidas alcoólicas durante a prestação dos serviços e zelo pelos bens da CONTRATANTE.')

  heading('CLÁUSULA SÉTIMA – DO USO DE IMAGEM, MONITORAMENTO E CONFIDENCIALIDADE')
  paragraph('O(A) CONTRATADO(A) declara ciência de que o estabelecimento pode possuir câmeras de segurança, sistemas de controle operacional e registros internos destinados à segurança, conferência de operações e proteção patrimonial.')
  paragraph('O(A) CONTRATADO(A) autoriza, de forma gratuita e limitada, o uso de sua imagem em registros incidentais de fotos e vídeos do evento, exclusivamente para divulgação institucional da CONTRATANTE em redes sociais, materiais promocionais e registros internos, sem finalidade ofensiva ou vexatória.')
  paragraph('O(A) CONTRATADO(A) compromete-se a manter sigilo sobre informações comerciais, operacionais, receitas, fornecedores, clientes, estratégias, valores, dados internos e quaisquer informações obtidas em razão da prestação dos serviços.')

  heading('CLÁUSULA OITAVA – DO CANCELAMENTO, AUSÊNCIA E RESCISÃO')
  paragraph(`8.1. O presente contrato poderá ser cancelado por qualquer das partes, sem multa, mediante aviso prévio mínimo de ${c.avisoPrevio} horas.`)
  paragraph('8.2. O não comparecimento injustificado do(a) CONTRATADO(A), sem aviso prévio, poderá gerar responsabilização por perdas e danos comprovadamente causados à CONTRATANTE, especialmente quando houver prejuízo operacional direto ao evento.')
  paragraph('8.3. A CONTRATANTE poderá rescindir imediatamente a contratação, sem obrigação de pagamento integral, em caso de conduta inadequada, embriaguez, agressividade, furto, assédio, descumprimento grave de normas de higiene ou segurança, dano ao patrimônio ou atendimento incompatível com o padrão mínimo do estabelecimento.')
  paragraph('8.4. Em caso de interrupção parcial dos serviços por culpa do(a) CONTRATADO(A), o pagamento poderá ser proporcional ao serviço efetivamente prestado, sem prejuízo da apuração de danos.')

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
