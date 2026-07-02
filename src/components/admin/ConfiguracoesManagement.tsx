import { useState, useEffect, FormEvent } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { CheckCircle2, Percent, Store, MessageSquare, Eye, EyeOff } from 'lucide-react'
import { supabase } from '@/integrations/supabase/client'

interface Settings {
  restaurant_name: string
  service_charge_percent: number
  service_charge_enabled: boolean
  evolution_api_url: string
  evolution_api_key: string
  evolution_instance: string
}

const DEFAULTS: Settings = {
  restaurant_name: 'Raízes do Planalto',
  service_charge_percent: 10,
  service_charge_enabled: true,
  evolution_api_url: '',
  evolution_api_key: '',
  evolution_instance: '',
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

  useEffect(() => {
    async function load() {
      const [name, percent, enabled, evoUrl, evoKey, evoInst] = await Promise.all([
        loadSetting('restaurant_name'),
        loadSetting('service_charge_percent'),
        loadSetting('service_charge_enabled'),
        loadSetting('evolution_api_url'),
        loadSetting('evolution_api_key'),
        loadSetting('evolution_instance'),
      ])
      setSettings({
        restaurant_name: typeof name === 'string' ? name : DEFAULTS.restaurant_name,
        service_charge_percent: typeof percent === 'number' ? percent : Number(percent ?? DEFAULTS.service_charge_percent),
        service_charge_enabled: enabled === undefined ? DEFAULTS.service_charge_enabled : Boolean(enabled),
        evolution_api_url: (evoUrl as string ?? '').replace(/^"|"$/g, ''),
        evolution_api_key: (evoKey as string ?? '').replace(/^"|"$/g, ''),
        evolution_instance: (evoInst as string ?? '').replace(/^"|"$/g, ''),
      })
      setLoading(false)
    }
    load()
  }, [])

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
