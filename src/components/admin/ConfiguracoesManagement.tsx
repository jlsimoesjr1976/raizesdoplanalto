import { useState, useEffect, FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import {
  CheckCircle2, Percent, Eye, EyeOff, CreditCard, Loader2, RefreshCw, XCircle,
  Building2, MessageSquare, Search,
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { supabase } from '@/integrations/supabase/client'
import { testConnection, listDevices, type PointDevice } from '@/lib/mercadopago'
import { fetchCnpj, applyCnpjMask, onlyDigits } from '@/lib/cnpj'

interface Settings {
  restaurant_name: string
  // Fiscal
  cnpj: string
  inscricao_estadual: string
  razao_social: string
  nome_fantasia: string
  fiscal_cep: string
  fiscal_logradouro: string
  fiscal_numero: string
  fiscal_complemento: string
  fiscal_bairro: string
  fiscal_municipio: string
  fiscal_uf: string
  fiscal_telefone: string
  cnae_codigo: string
  cnae_descricao: string
  // Taxa
  service_charge_percent: number
  service_charge_enabled: boolean
  // Evolution
  evolution_api_url: string
  evolution_api_key: string
  evolution_instance: string
  // Mercado Pago
  mp_environment: string
  mp_public_key: string
  mp_access_token: string
  mp_device_id: string
  mp_point_enabled: boolean
}

const DEFAULTS: Settings = {
  restaurant_name: 'Raízes do Planalto',
  cnpj: '',
  inscricao_estadual: '',
  razao_social: '',
  nome_fantasia: '',
  fiscal_cep: '',
  fiscal_logradouro: '',
  fiscal_numero: '',
  fiscal_complemento: '',
  fiscal_bairro: '',
  fiscal_municipio: '',
  fiscal_uf: '',
  fiscal_telefone: '',
  cnae_codigo: '',
  cnae_descricao: '',
  service_charge_percent: 10,
  service_charge_enabled: true,
  evolution_api_url: '',
  evolution_api_key: '',
  evolution_instance: '',
  mp_environment: 'test',
  mp_public_key: '',
  mp_access_token: '',
  mp_device_id: '',
  mp_point_enabled: false,
}

const STRING_KEYS: (keyof Settings)[] = [
  'restaurant_name', 'cnpj', 'inscricao_estadual', 'razao_social', 'nome_fantasia',
  'fiscal_cep', 'fiscal_logradouro', 'fiscal_numero', 'fiscal_complemento',
  'fiscal_bairro', 'fiscal_municipio', 'fiscal_uf', 'fiscal_telefone',
  'cnae_codigo', 'cnae_descricao', 'evolution_api_url', 'evolution_api_key',
  'evolution_instance', 'mp_environment', 'mp_public_key', 'mp_access_token', 'mp_device_id',
]

async function loadSetting(key: string) {
  const { data } = await supabase.from('settings').select('value').eq('key', key).single()
  return data?.value
}

async function saveSetting(key: string, value: unknown) {
  await supabase.from('settings').upsert({ key, value, updated_at: new Date().toISOString() })
}

export function ConfiguracoesManagement() {
  const [settings, setSettings] = useState<Settings>(DEFAULTS)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [showApiKey, setShowApiKey] = useState(false)
  const [showMpToken, setShowMpToken] = useState(false)

  // CNPJ
  const [cnpjLoading, setCnpjLoading] = useState(false)
  const [cnpjStatus, setCnpjStatus] = useState<{ ok: boolean; message: string } | null>(null)

  // Mercado Pago
  const [mpTesting, setMpTesting] = useState(false)
  const [mpStatus, setMpStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [mpDevices, setMpDevices] = useState<PointDevice[]>([])
  const [mpLoadingDevices, setMpLoadingDevices] = useState(false)

  useEffect(() => {
    async function load() {
      const keys = [...STRING_KEYS, 'service_charge_percent', 'service_charge_enabled', 'mp_point_enabled']
      const values = await Promise.all(keys.map((k) => loadSetting(k)))
      const map = new Map(keys.map((k, i) => [k, values[i]]))
      const str = (v: unknown) => (v as string ?? '').replace(/^"|"$/g, '')

      const next: Settings = { ...DEFAULTS }
      const nextRec = next as unknown as Record<string, unknown>
      for (const k of STRING_KEYS) {
        const v = str(map.get(k))
        if (v) nextRec[k] = v
      }
      const pct = map.get('service_charge_percent')
      next.service_charge_percent = typeof pct === 'number' ? pct : Number(pct ?? DEFAULTS.service_charge_percent)
      const enabled = map.get('service_charge_enabled')
      next.service_charge_enabled = enabled === undefined ? DEFAULTS.service_charge_enabled : Boolean(enabled)
      next.mp_environment = str(map.get('mp_environment')) || 'test'
      next.mp_point_enabled = map.get('mp_point_enabled') === true

      setSettings(next)
      setLoading(false)
    }
    load()
  }, [])

  async function handleCnpjLookup(rawCnpj?: string) {
    const value = rawCnpj ?? settings.cnpj
    setCnpjLoading(true)
    setCnpjStatus(null)
    const res = await fetchCnpj(value)
    if (!res.ok || !res.data) {
      setCnpjStatus({ ok: false, message: res.error ?? 'Erro ao consultar CNPJ' })
      setCnpjLoading(false)
      return
    }
    const d = res.data
    setSettings((s) => ({
      ...s,
      razao_social: d.razao_social,
      nome_fantasia: d.nome_fantasia,
      restaurant_name: d.nome_fantasia || d.razao_social || s.restaurant_name,
      fiscal_cep: d.cep,
      fiscal_logradouro: d.logradouro,
      fiscal_numero: d.numero,
      fiscal_complemento: d.complemento,
      fiscal_bairro: d.bairro,
      fiscal_municipio: d.municipio,
      fiscal_uf: d.uf,
      fiscal_telefone: d.telefone,
      cnae_codigo: d.cnae_codigo,
      cnae_descricao: d.cnae_descricao,
    }))
    setCnpjStatus({ ok: true, message: `${d.razao_social}${d.situacao ? ` · ${d.situacao}` : ''}` })
    setCnpjLoading(false)
  }

  function handleCnpjChange(raw: string) {
    const masked = applyCnpjMask(raw)
    setSettings((s) => ({ ...s, cnpj: masked }))
    setCnpjStatus(null)
    if (onlyDigits(masked).length === 14) handleCnpjLookup(masked)
  }

  async function handleMpTest() {
    setMpTesting(true)
    setMpStatus(null)
    await saveSetting('mp_access_token', settings.mp_access_token)
    const result = await testConnection()
    setMpStatus(result.ok
      ? { ok: true, message: `Conectado! Conta: ${result.nickname}` }
      : { ok: false, message: result.error ?? 'Falha na conexão' })
    setMpTesting(false)
  }

  async function handleMpLoadDevices() {
    setMpLoadingDevices(true)
    await saveSetting('mp_access_token', settings.mp_access_token)
    const result = await listDevices()
    setMpDevices(result.devices)
    if (!result.ok) setMpStatus({ ok: false, message: result.error ?? 'Erro ao buscar maquininhas' })
    else if (result.devices.length === 0) setMpStatus({ ok: true, message: 'Conexão OK, mas nenhuma maquininha vinculada a esta conta ainda.' })
    setMpLoadingDevices(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    const ops = STRING_KEYS.map((k) => saveSetting(k, settings[k]))
    ops.push(
      saveSetting('service_charge_percent', settings.service_charge_percent),
      saveSetting('service_charge_enabled', settings.service_charge_enabled),
      saveSetting('mp_point_enabled', settings.mp_point_enabled),
    )
    await Promise.all(ops)
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  const set = (field: keyof Settings) => (v: string) => setSettings((s) => ({ ...s, [field]: v }))

  if (loading) return <div className="text-muted-foreground text-sm p-6">Carregando configurações...</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Configurações</h2>
        <p className="text-muted-foreground text-sm mt-1">Parâmetros gerais do sistema</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <Tabs defaultValue="fiscal">
          <TabsList className="flex-wrap h-auto">
            <TabsTrigger value="fiscal" className="gap-1.5"><Building2 className="w-4 h-4" />Fiscal</TabsTrigger>
            <TabsTrigger value="service" className="gap-1.5"><Percent className="w-4 h-4" />Taxa de Serviço</TabsTrigger>
            <TabsTrigger value="whatsapp" className="gap-1.5"><MessageSquare className="w-4 h-4" />WhatsApp</TabsTrigger>
            <TabsTrigger value="mercadopago" className="gap-1.5"><CreditCard className="w-4 h-4" />Mercado Pago</TabsTrigger>
          </TabsList>

          {/* ── FISCAL ── */}
          <TabsContent value="fiscal" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Dados Fiscais</CardTitle>
                </div>
                <CardDescription>Dados do estabelecimento para emissão de documentos fiscais</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* CNPJ com busca automática */}
                <div className="space-y-1.5">
                  <Label>CNPJ</Label>
                  <div className="relative">
                    <Input
                      value={settings.cnpj}
                      onChange={(e) => handleCnpjChange(e.target.value)}
                      placeholder="00.000.000/0000-00"
                      inputMode="numeric"
                      maxLength={18}
                      className="pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => handleCnpjLookup()}
                      disabled={cnpjLoading}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-primary"
                      title="Buscar dados na Receita"
                    >
                      {cnpjLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Search className="w-4 h-4" />}
                    </button>
                  </div>
                  {cnpjStatus && (
                    <p className={`text-xs flex items-center gap-1.5 ${cnpjStatus.ok ? 'text-green-600' : 'text-destructive'}`}>
                      {cnpjStatus.ok ? <CheckCircle2 className="w-3.5 h-3.5" /> : <XCircle className="w-3.5 h-3.5" />}
                      {cnpjStatus.message}
                    </p>
                  )}
                  {!cnpjStatus && (
                    <p className="text-xs text-muted-foreground">
                      Ao digitar o CNPJ completo, os dados são preenchidos automaticamente pela Receita Federal.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label>Inscrição Estadual</Label>
                  <Input
                    value={settings.inscricao_estadual}
                    onChange={(e) => set('inscricao_estadual')(e.target.value)}
                    placeholder="Inscrição Estadual (ou ISENTO)"
                  />
                </div>

                <Separator />

                <div className="space-y-1.5">
                  <Label>Razão Social</Label>
                  <Input value={settings.razao_social} onChange={(e) => set('razao_social')(e.target.value)} placeholder="Razão social da empresa" />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Nome Fantasia</Label>
                    <Input value={settings.nome_fantasia} onChange={(e) => set('nome_fantasia')(e.target.value)} placeholder="Nome fantasia" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Nome de exibição</Label>
                    <Input value={settings.restaurant_name} onChange={(e) => set('restaurant_name')(e.target.value)} placeholder="Nome usado no sistema" />
                  </div>
                </div>

                <Separator />
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Endereço</p>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>CEP</Label>
                    <Input value={settings.fiscal_cep} onChange={(e) => set('fiscal_cep')(e.target.value)} placeholder="00000-000" />
                  </div>
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Logradouro</Label>
                    <Input value={settings.fiscal_logradouro} onChange={(e) => set('fiscal_logradouro')(e.target.value)} placeholder="Rua / Avenida" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5">
                    <Label>Número</Label>
                    <Input value={settings.fiscal_numero} onChange={(e) => set('fiscal_numero')(e.target.value)} placeholder="Nº" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Complemento</Label>
                    <Input value={settings.fiscal_complemento} onChange={(e) => set('fiscal_complemento')(e.target.value)} placeholder="Sala, andar..." />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Bairro</Label>
                    <Input value={settings.fiscal_bairro} onChange={(e) => set('fiscal_bairro')(e.target.value)} placeholder="Bairro" />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="space-y-1.5 sm:col-span-2">
                    <Label>Município</Label>
                    <Input value={settings.fiscal_municipio} onChange={(e) => set('fiscal_municipio')(e.target.value)} placeholder="Cidade" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>UF</Label>
                    <Input value={settings.fiscal_uf} onChange={(e) => set('fiscal_uf')(e.target.value)} placeholder="UF" maxLength={2} />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <Label>Telefone</Label>
                    <Input value={settings.fiscal_telefone} onChange={(e) => set('fiscal_telefone')(e.target.value)} placeholder="Telefone" />
                  </div>
                  <div className="space-y-1.5">
                    <Label>CNAE principal</Label>
                    <Input value={settings.cnae_codigo} onChange={(e) => set('cnae_codigo')(e.target.value)} placeholder="0000000" />
                  </div>
                </div>

                {settings.cnae_descricao && (
                  <p className="text-xs text-muted-foreground">Atividade: {settings.cnae_descricao}</p>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── TAXA DE SERVIÇO ── */}
          <TabsContent value="service" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Percent className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Taxa de Serviço</CardTitle>
                </div>
                <CardDescription>Configuração da taxa aplicada ao fechar a conta</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium">Habilitada por padrão</p>
                    <p className="text-xs text-muted-foreground">A taxa aparece marcada ao abrir o modal de fechamento</p>
                  </div>
                  <Switch
                    checked={settings.service_charge_enabled}
                    onCheckedChange={(v) => setSettings((s) => ({ ...s, service_charge_enabled: v }))}
                  />
                </div>
                <Separator />
                <div className="space-y-1.5">
                  <Label>Percentual (%)</Label>
                  <div className="relative w-36">
                    <Input
                      type="number"
                      min={0}
                      max={100}
                      step={0.5}
                      value={settings.service_charge_percent}
                      onChange={(e) => setSettings((s) => ({ ...s, service_charge_percent: parseFloat(e.target.value) || 0 }))}
                      className="pr-8"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">%</span>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    Padrão recomendado: 10%. Pode ser ajustado por atendimento no momento do fechamento.
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── WHATSAPP ── */}
          <TabsContent value="whatsapp" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <MessageSquare className="w-4 h-4 text-primary" />
                  <CardTitle className="text-base">Evolution API — WhatsApp</CardTitle>
                </div>
                <CardDescription>Integração para envio de códigos de verificação e marketing</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-1.5">
                  <Label>URL da API</Label>
                  <Input value={settings.evolution_api_url} onChange={(e) => set('evolution_api_url')(e.target.value)} placeholder="https://sua-evolution.com" />
                </div>
                <div className="space-y-1.5">
                  <Label>API Key</Label>
                  <div className="relative">
                    <Input
                      type={showApiKey ? 'text' : 'password'}
                      value={settings.evolution_api_key}
                      onChange={(e) => set('evolution_api_key')(e.target.value)}
                      placeholder="••••••••••••"
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowApiKey((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>Nome da Instância</Label>
                  <Input value={settings.evolution_instance} onChange={(e) => set('evolution_instance')(e.target.value)} placeholder="raizes-planalto" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Quando configurada, um código de 4 dígitos é enviado via WhatsApp ao cadastrar clientes para validar o celular.
                </p>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ── MERCADO PAGO ── */}
          <TabsContent value="mercadopago" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-primary" />
                    <CardTitle className="text-base">Mercado Pago — Maquininha Point</CardTitle>
                  </div>
                  <Badge variant={settings.mp_environment === 'test' ? 'secondary' : 'default'} className="text-xs">
                    {settings.mp_environment === 'test' ? 'Ambiente de Teste' : 'Produção'}
                  </Badge>
                </div>
                <CardDescription>Validação de pagamentos efetuados pela maquininha Point (Brasil)</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between rounded-lg border p-3 bg-muted/30">
                  <div>
                    <p className="text-sm font-medium">Ativar cobrança na maquininha</p>
                    <p className="text-xs text-muted-foreground">Quando desligado, o fechamento de conta usa apenas a baixa manual</p>
                  </div>
                  <Switch checked={settings.mp_point_enabled} onCheckedChange={(v) => setSettings((s) => ({ ...s, mp_point_enabled: v }))} />
                </div>

                <div className="space-y-1.5">
                  <Label>Ambiente</Label>
                  <Select value={settings.mp_environment} onValueChange={set('mp_environment')}>
                    <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="test">Teste (sandbox)</SelectItem>
                      <SelectItem value="production">Produção</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label>Public Key</Label>
                  <Input value={settings.mp_public_key} onChange={(e) => set('mp_public_key')(e.target.value)} placeholder="APP_USR-..." />
                </div>

                <div className="space-y-1.5">
                  <Label>Access Token</Label>
                  <div className="relative">
                    <Input
                      type={showMpToken ? 'text' : 'password'}
                      value={settings.mp_access_token}
                      onChange={(e) => set('mp_access_token')(e.target.value)}
                      placeholder="APP_USR-..."
                      className="pr-10"
                    />
                    <button type="button" onClick={() => setShowMpToken((v) => !v)} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">
                      {showMpToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label>Maquininha Point</Label>
                  <div className="flex gap-2">
                    <Select value={settings.mp_device_id} onValueChange={set('mp_device_id')}>
                      <SelectTrigger className="flex-1">
                        <SelectValue placeholder={mpDevices.length === 0 ? 'Busque as maquininhas vinculadas...' : 'Selecionar maquininha...'} />
                      </SelectTrigger>
                      <SelectContent>
                        {mpDevices.length === 0 && <SelectItem value="__none__" disabled>Nenhuma maquininha encontrada</SelectItem>}
                        {mpDevices.map((d) => (
                          <SelectItem key={d.id} value={d.id}>
                            {d.id} {d.operating_mode === 'PDV' ? '(modo PDV)' : '(standalone)'}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button type="button" variant="outline" onClick={handleMpLoadDevices} disabled={mpLoadingDevices}>
                      {mpLoadingDevices ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />}
                    </Button>
                  </div>
                  <p className="text-xs text-muted-foreground">
                    A maquininha precisa estar logada na conta Mercado Pago e vinculada via aplicativo para aparecer aqui.
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <Button type="button" variant="outline" onClick={handleMpTest} disabled={mpTesting}>
                    {mpTesting ? <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Testando...</> : 'Testar conexão'}
                  </Button>
                  {mpStatus && (
                    <span className={`flex items-center gap-1.5 text-sm font-medium ${mpStatus.ok ? 'text-green-600' : 'text-destructive'}`}>
                      {mpStatus.ok ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
                      {mpStatus.message}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Botão salvar */}
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={saving}>
            {saving ? 'Salvando...' : 'Salvar configurações'}
          </Button>
          {saved && (
            <span className="flex items-center gap-1.5 text-sm text-green-600 font-medium">
              <CheckCircle2 className="w-4 h-4" />
              Salvo com sucesso!
            </span>
          )}
        </div>
      </form>
    </div>
  )
}
