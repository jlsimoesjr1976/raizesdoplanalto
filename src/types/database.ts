export type Role = 'admin' | 'waiter' | 'kitchen'
export type TableStatus = 'free' | 'occupied' | 'reserved'
export type OrderStatus = 'open' | 'paid' | 'cancelled'
export type KitchenStatus = 'pending' | 'preparing' | 'ready' | 'delivered'
export type StockMovementType = 'in' | 'out' | 'adjustment'

export interface Profile {
  id: string
  name: string
  role: Role
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
  created_at: string
}

export interface Product {
  id: string
  category_id: string | null
  name: string
  description: string | null
  price: number
  cost_price: number
  stock_quantity: number
  ncm: string | null
  cest: string | null
  cfop: string | null
  csosn: string | null
  origem: number | null
  image_url: string | null
  has_ingredients: boolean
  active: boolean
  sort_order: number
  created_at: string
  categories?: Category
}

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
  created_at: string
}

export interface Freelancer {
  id: string
  name: string
  cpf: string
  has_mei: boolean
  cnpj: string | null
  phone: string | null
  daily_rate: number
  registration_date: string
  created_at: string
}

export type FinancialEntryType = 'payment' | 'receipt'

export interface FinancialAttachment {
  name: string
  url: string
  path: string
}

export interface FinancialEntry {
  id: string
  type: FinancialEntryType
  description: string
  amount: number
  entry_date: string
  notes: string | null
  attachments: FinancialAttachment[]
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
