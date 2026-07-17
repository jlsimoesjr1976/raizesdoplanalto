export type Role = 'admin' | 'atendente' | 'cozinha' | 'bar' | 'caixa'

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrador',
  atendente: 'Atendente',
  cozinha: 'Cozinha',
  bar: 'Bar',
  caixa: 'Caixa',
}
export type TableStatus = 'free' | 'occupied' | 'reserved'
export type OrderStatus = 'open' | 'paid' | 'cancelled'
export type KitchenStatus = 'pending' | 'preparing' | 'ready' | 'delivered'
export type StockMovementType = 'in' | 'out' | 'adjustment'

export interface Profile {
  id: string
  name: string
  role: Role
  phone: string | null
  email: string | null
  active: boolean
  created_at: string
}

export interface Category {
  id: string
  name: string
  description: string | null
  image_url: string | null
  sort_order: number
  active: boolean
  show_in_menu: boolean
  created_at: string
}

export interface Combo {
  id: string
  name: string
  discount_percent: number
  image_url: string | null
  active: boolean
  show_in_menu: boolean
  created_at: string
  combo_items?: ComboItem[]
}

export interface ComboItem {
  id: string
  combo_id: string
  product_id: string
  quantity: number
  products?: Product
}

export interface Product {
  id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  cost_price: number
  stock_quantity: number
  infinite_stock: boolean
  ncm: string | null
  cest: string | null
  cfop: string | null
  csosn: string | null
  origem: number | null
  image_url: string | null
  has_ingredients: boolean
  active: boolean
  show_in_menu: boolean
  sort_order: number
  prep_station: PrepStation
  created_at: string
  categories?: Category
}

export type PrepStation = 'bar' | 'cozinha' | null

export interface ProductIngredient {
  product_id: string
  ingredient_id: string
  quantity: number
  ingredients: Ingredient
}

export interface Ingredient {
  id: string
  name: string
  unit: string
  quantity: number
  min_quantity: number
  cost: number          // valor pago pelo lote
  cost_per_unit: number // calculado: cost / quantity
  created_at: string
}

export interface StockMovement {
  id: string
  ingredient_id: string
  type: StockMovementType
  quantity: number
  reason: string | null
  created_by: string | null
  created_at: string
  ingredients?: Ingredient
}

export interface Table {
  id: string
  number: number
  name: string | null
  capacity: number
  status: TableStatus
  created_at: string
}

export interface Order {
  id: string
  table_id: string | null
  table_number: number | null
  status: OrderStatus
  waiter_id: string | null
  customer_id: string | null
  people_count: number
  customer_name: string | null
  customer_phone: string | null
  notes: string | null
  total: number
  mp_payment_ids: string[]
  order_type: 'comanda' | 'pedido'
  delivery_address: string | null
  delivery_reference: string | null
  delivery_status: 'recebido' | 'preparando' | 'saiu_entrega' | 'entregue'
  service_charge_included: boolean
  service_charge_percent: number | null
  service_charge_amount: number
  delivery_fee: number
  delivery_zone_name: string | null
  created_at: string
  closed_at: string | null
  tables?: Table
  profiles?: Profile
  order_items?: OrderItem[]
}

export interface OrderItem {
  id: string
  order_id: string
  product_id: string | null
  product_name: string
  quantity: number
  unit_price: number
  notes: string | null
  kitchen_status: KitchenStatus
  prep_station: PrepStation
  created_at: string
}

export interface Customer {
  id: string
  name: string
  phone: string | null
  phone_ddi: string | null
  phone_verified: boolean
  email: string | null
  birthday: string | null
  notes: string | null
  address: string | null
  address_reference: string | null
  cep: string | null
  street: string | null
  number: string | null
  complement: string | null
  neighborhood: string | null
  city: string | null
  state: string | null
  delivery_zone_id: string | null
  created_at: string
}

export interface DeliveryZone {
  id: string
  name: string
  fee: number
  active: boolean
  sort_order: number
  created_at: string
}

export interface DeliveryNeighborhood {
  id: string
  neighborhood: string
  city: string | null
  zone_id: string | null
  created_at: string
  delivery_zones?: DeliveryZone
}

export interface Freelancer {
  id: string
  name: string
  cpf: string
  has_mei: boolean
  cnpj: string | null
  phone: string | null
  daily_rate: number
  pix_key: string | null
  registration_date: string
  attachments: FinancialAttachment[]
  contract_data: ContractData | null
  created_at: string
}

export interface ContractData {
  profissao: string
  funcao: string
  rg: string
  endereco: string
  data: string
  horaInicio: string
  horaFim: string
  valor: string
  formaPagamento?: string
  avisoPrevio: string
  dataAssinatura: string
  pixKey?: string
}

export interface Supplier {
  id: string
  name: string
  cnpj: string | null
  phone: string | null
  email: string | null
  notes: string | null
  created_at: string
}

export interface Employee {
  id: string
  name: string
  cpf: string | null
  phone: string | null
  position: string | null
  salary: number | null
  created_at: string
}

export type FinancialEntryType = 'payment' | 'receipt'
export type BeneficiaryType = 'freelancer' | 'supplier' | 'employee'

export interface FinancialAttachment {
  name: string
  url: string
  path: string
}

export interface FinancialHistoryItem {
  at: string      // timestamp do lançamento
  by: string      // nome de quem lançou
  amount: number  // valor lançado
}

export interface FinancialEntry {
  id: string
  type: FinancialEntryType
  description: string
  amount: number
  entry_date: string
  notes: string | null
  attachments: FinancialAttachment[]
  beneficiary_type: BeneficiaryType | null
  beneficiary_id: string | null
  beneficiary_name: string | null
  history: FinancialHistoryItem[]
  paid: boolean
  paid_at: string | null
  payment_method: SettlementMethod | null
  fine: number
  interest: number
  final_amount: number | null
  receipt: FinancialAttachment | null
  created_at: string
}

export type SettlementMethod = 'pix' | 'boleto' | 'credito' | 'debito' | 'dinheiro'

export interface Invoice {
  id: string
  order_id: string | null
  ref: string
  environment: string
  status: 'processando' | 'autorizado' | 'erro' | 'cancelado'
  cpf: string | null
  customer_name: string | null
  amount: number
  focus_status: string | null
  numero: string | null
  serie: string | null
  chave: string | null
  danfe_url: string | null
  xml_url: string | null
  message: string | null
  created_at: string
  updated_at: string
}

export interface BroadcastList {
  id: string
  name: string
  member_ids: string[]
  created_at: string
}

export interface MarketingCampaign {
  id: string
  name: string
  message: string
  status: 'draft' | 'sending' | 'sent' | 'failed'
  scheduled_at: string | null
  sent_at: string | null
  sent_count: number
  created_by: string | null
  created_at: string
}

// ── Contabilidade ────────────────────────────────────────────────────────────

export type AccKind = 'ativo' | 'passivo' | 'pl' | 'receita' | 'custo' | 'despesa' | 'compensatoria'
export type AccNature = 'D' | 'C'
export type AccEntryStatus = 'rascunho' | 'pendente' | 'aprovado' | 'contabilizado' | 'estornado'

export interface AccAccount {
  id: string
  code: string
  name: string
  kind: AccKind
  nature: AccNature
  parent_id: string | null
  level: number
  allows_entries: boolean
  active: boolean
  default_cost_center_id: string | null
  notes: string | null
  created_at: string
}

export interface AccCostCenter {
  id: string
  name: string
  active: boolean
  created_at: string
}

export interface AccEntryLine {
  id: string
  entry_id: string
  account_id: string
  side: AccNature
  amount: number
  cost_center_id: string | null
  acc_accounts?: AccAccount
}

export interface AccEntry {
  id: string
  competence_date: string
  cash_date: string | null
  history: string
  document: string | null
  origin: string
  origin_table: string | null
  origin_id: string | null
  status: AccEntryStatus
  reversal_of: string | null
  cost_center_id: string | null
  attachments: FinancialAttachment[]
  notes: string | null
  created_by: string | null
  created_at: string
  acc_entry_lines?: AccEntryLine[]
}
