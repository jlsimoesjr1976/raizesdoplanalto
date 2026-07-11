import { useState, useEffect, FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { CheckCircle2, Percent, Store, MessageSquare, Eye, EyeOff, CreditCard, Loader2, RefreshCw, XCircle } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Badge } from '@/components/ui/badge'
import { supabase } from '@/integrations/supabase/client'
import { testConnection, listDevices, type PointDevice } from '@/lib/mercadopago'

interface Settings {
  restaurant_name: string
  service_charge_percent: number
  service_charge_enabled: boolean
  evolution_api_url: string
  evolution_api_key: string
  evolution_instance: string
  mp_environment: string
  mp_public_key: string
  mp_access_token: string
  mp_device_id: string
  mp_point_enabled: boolean
}

const DEFAULTS: Settings = {
  restaurant_name: 'Raízes do Planalto',
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

  // Estado da conexão / maquininhas Mercado Pago
  const [mpTesting, setMpTesting] = useState(false)
  const [mpStatus, setMpStatus] = useState<{ ok: boolean; message: string } | null>(null)
  const [mpDevices, setMpDevices] = useState<PointDevice[]>([])
  const [mpLoadingDevices, setMpLoadingDevices] = useState(false)

  useEffect(() => {
    async function load() {
      const [name, percent, enabled, evoUrl, evoKey, evoInst, mpEnv, mpPk, mpToken, mpDevice, mpPoint] = await Promise.all([
        loadSetting('restaurant_name'),
        loadSetting('service_charge_percent'),
        loadSetting('service_charge_enabled'),
        loadSetting('evolution_api_url'),
        loadSetting('evolution_api_key'),
        loadSetting('evolution_instance'),
        loadSetting('mp_environment'),
        loadSetting('mp_public_key'),
        loadSetting('mp_access_token'),
        loadSetting('mp_device_id'),
        loadSetting('mp_point_enabled'),
      ])
      const str = (v: unknown) => (v as string ?? '').replace(/^"|"$/g, '')
      setSettings({
        restaurant_name: typeof name === 'string' ? name : DEFAULTS.restaurant_name,
        service_charge_percent: typeof percent === 'number' ? percent : Number(percent ?? DEFAULTS.service_charge_percent),
        service_charge_enabled: enabled === undefined ? DEFAULTS.service_charge_enabled : Boolean(enabled),
        evolution_api_url: str(evoUrl),
        evolution_api_key: str(evoKey),
        evolution_instance: str(evoInst),
        mp_environment: str(mpEnv) || 'test',
        mp_public_key: str(mpPk),
        mp_access_token: str(mpToken),
        mp_device_id: str(mpDevice),
        mp_point_enabled: mpPoint === true,
      })
      setLoading(false)
    }
    load()
  }, [])

  async function handleMpTest() {
    setMpTesting(true)
    setMpStatus(null)
    // Garante que o token digitado está salvo antes do teste
    await saveSetting('mp_access_token', settings.mp_access_token)
    const result = await testConnection()
    setMpStatus(
      result.ok
        ? { ok: true, message: `Conectado! Conta: ${result.nickname}` }
        : { ok: false, message: result.error ?? 'Falha na conexão' }
    )
    setMpTesting(false)
  }

  async function handleMpLoadDevices() {
    setMpLoadingDevices(true)
    await saveSetting('mp_access_token', settings.mp_access_token)
    const result = await listDevices()
    setMpDevices(result.devices)
    if (!result.ok) {
      setMpStatus({ ok: false, message: result.error ?? 'Erro ao buscar maquininhas' })
    } else if (result.devices.length === 0) {
      setMpStatus({ ok: true, message: 'Conexão OK, mas nenhuma maquininha vinculada a esta conta ainda.' })
    }
    setMpLoadingDevices(false)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSaving(true)
    await Promise.all([
      saveSetting('restaurant_name', settings.restaurant_name),
      saveSetting('service_charge_percent', settings.service_charge_percent),
      saveSetting('service_charge_enabled', settings.service_charge_enabled),
      saveSetting('evolution_api_url', settings.evolution_api_url),
      saveSetting('evolution_api_key', settings.evolution_api_key),
      saveSetting('evolution_instance', settings.evolution_instance),
      saveSetting('mp_environment', settings.mp_environment),
      saveSetting('mp_public_key', settings.mp_public_key),
      saveSetting('mp_access_token', settings.mp_access_token),
      saveSetting('mp_device_id', settings.mp_device_id),
      saveSetting('mp_point_enabled', settings.mp_point_enabled),
    ])
    setSaving(false)
    setSaved(true)
    setTimeout(() => setSaved(false), 2500)
  }

  if (loading) return <div className="text-muted-foreground text-sm p-6">Carregando configurações...</div>

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h2 className="text-2xl font-bold">Configurações</h2>
        <p className="text-muted-foreground text-sm mt-1">Parâmetros gerais do sistema</p>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        {/* Dados do restaurante */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <Store className="w-4 h-4 text-primary" />
              <CardTitle className="text-base">Restaurante</CardTitle>
            </div>
            <CardDescription>Informações básicas do estabelecimento</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-1.5">
              <Label>Nome do restaurante</Label>
              <Input
                value={settings.restaurant_name}
                onChange={(e) => setSettings((s) => ({ ...s, restaurant_name: e.target.value }))}
                placeholder="Nome do estabelecimento"
              />
            </div>
          </CardContent>
        </Card>

        {/* Taxa de serviço */}
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
                <p className="text-xs text-muted-foreground">
                  A taxa aparece marcada ao abrir o modal de fechamento
                </p>
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

        {/* Evolution API */}
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
              <Input
                value={settings.evolution_api_url}
                onChange={(e) => setSettings((s) => ({ ...s, evolution_api_url: e.target.value }))}
                placeholder="https://sua-evolution.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>API Key</Label>
              <div className="relative">
                <Input
                  type={showApiKey ? 'text' : 'password'}
                  value={settings.evolution_api_key}
                  onChange={(e) => setSettings((s) => ({ ...s, evolution_api_key: e.target.value }))}
                  placeholder="••••••••••••"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowApiKey((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showApiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>Nome da Instância</Label>
              <Input
                value={settings.evolution_instance}
                onChange={(e) => setSettings((s) => ({ ...s, evolution_instance: e.target.value }))}
                placeholder="raizes-planalto"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              Quando configurada, um código de 4 dígitos é enviado via WhatsApp ao cadastrar clientes para validar o celular.
            </p>
          </CardContent>
        </Card>

        {/* Mercado Pago Point */}
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
                <p className="text-xs text-muted-foreground">
                  Quando desligado, o fechamento de conta usa apenas a baixa manual
                </p>
              </div>
              <Switch
                checked={settings.mp_point_enabled}
                onCheckedChange={(v) => setSettings((s) => ({ ...s, mp_point_enabled: v }))}
              />
            </div>

            <div className="space-y-1.5">
              <Label>Ambiente</Label>
              <Select
                value={settings.mp_environment}
                onValueChange={(v) => setSettings((s) => ({ ...s, mp_environment: v }))}
              >
                <SelectTrigger className="w-52">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="test">Teste (sandbox)</SelectItem>
                  <SelectItem value="production">Produção</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label>Public Key</Label>
              <Input
                value={settings.mp_public_key}
                onChange={(e) => setSettings((s) => ({ ...s, mp_public_key: e.target.value }))}
                placeholder="APP_USR-..."
              />
            </div>

            <div className="space-y-1.5">
              <Label>Access Token</Label>
              <div className="relative">
                <Input
                  type={showMpToken ? 'text' : 'password'}
                  value={settings.mp_access_token}
                  onChange={(e) => setSettings((s) => ({ ...s, mp_access_token: e.target.value }))}
                  placeholder="APP_USR-..."
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowMpToken((v) => !v)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showMpToken ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {/* Maquininha */}
            <div className="space-y-1.5">
              <Label>Maquininha Point</Label>
              <div className="flex gap-2">
                <Select
                  value={settings.mp_device_id}
                  onValueChange={(v) => setSettings((s) => ({ ...s, mp_device_id: v }))}
                >
                  <SelectTrigger className="flex-1">
                    <SelectValue placeholder={mpDevices.length === 0 ? 'Busque as maquininhas vinculadas...' : 'Selecionar maquininha...'} />
                  </SelectTrigger>
                  <SelectContent>
                    {mpDevices.length === 0 && (
                      <SelectItem value="__none__" disabled>Nenhuma maquininha encontrada</SelectItem>
                    )}
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

            {/* Testar conexão */}
            <div className="flex items-center gap-3 flex-wrap">
              <Button type="button" variant="outline" onClick={handleMpTest} disabled={mpTesting}>
                {mpTesting ? (
                  <><Loader2 className="w-4 h-4 mr-1.5 animate-spin" />Testando...</>
                ) : (
                  'Testar conexão'
                )}
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
