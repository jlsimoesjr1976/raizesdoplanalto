import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import { MessageSquare, Megaphone } from 'lucide-react'
import { ConversasTab } from './ConversasTab'
import { ListasTab } from './ListasTab'

export function MarketingManagement() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-bold">Marketing</h2>
        <p className="text-muted-foreground text-sm mt-0.5">Atendimento e campanhas via WhatsApp</p>
      </div>

      <Tabs defaultValue="conversas">
        <TabsList>
          <TabsTrigger value="conversas" className="gap-1.5"><MessageSquare className="w-4 h-4" />Conversas</TabsTrigger>
          <TabsTrigger value="listas" className="gap-1.5"><Megaphone className="w-4 h-4" />Listas de Distribuição</TabsTrigger>
        </TabsList>
        <TabsContent value="conversas" className="mt-4">
          <ConversasTab />
        </TabsContent>
        <TabsContent value="listas" className="mt-4">
          <ListasTab />
        </TabsContent>
      </Tabs>
    </div>
  )
}
