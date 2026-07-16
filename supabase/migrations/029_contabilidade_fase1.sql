-- Contabilidade — Fase 1: núcleo de partidas dobradas
-- Tabelas acc_*, RPCs transacionais, RLS admin-only, plano de contas padrão.

-- 1) Plano de contas
CREATE TABLE IF NOT EXISTS acc_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('ativo','passivo','pl','receita','custo','despesa','compensatoria')),
  nature char(1) NOT NULL CHECK (nature IN ('D','C')),
  parent_id uuid REFERENCES acc_accounts(id),
  level int NOT NULL DEFAULT 1,
  allows_entries boolean NOT NULL DEFAULT true,
  active boolean NOT NULL DEFAULT true,
  default_cost_center_id uuid,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2) Centros de custo
CREATE TABLE IF NOT EXISTS acc_cost_centers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE acc_accounts ADD CONSTRAINT acc_accounts_default_cc_fk
  FOREIGN KEY (default_cost_center_id) REFERENCES acc_cost_centers(id);

-- 3) Competências (fechamento mensal — trava usada desde a Fase 1)
CREATE TABLE IF NOT EXISTS acc_periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  status text NOT NULL DEFAULT 'aberto' CHECK (status IN ('aberto','em_conferencia','fechado','reaberto')),
  closed_by uuid,
  closed_at timestamptz,
  reopen_reason text,
  UNIQUE (year, month)
);

-- 4) Lançamentos (cabeçalho) e partidas
CREATE TABLE IF NOT EXISTS acc_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  competence_date date NOT NULL,
  cash_date date,
  history text NOT NULL,
  document text,
  origin text NOT NULL DEFAULT 'manual',
  origin_table text,
  origin_id uuid,
  origin_event text,
  status text NOT NULL DEFAULT 'contabilizado' CHECK (status IN ('rascunho','pendente','aprovado','contabilizado','estornado')),
  reversal_of uuid REFERENCES acc_entries(id),
  cost_center_id uuid REFERENCES acc_cost_centers(id),
  attachments jsonb NOT NULL DEFAULT '[]',
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
-- integração automática nunca duplica
CREATE UNIQUE INDEX IF NOT EXISTS acc_entries_origin_unique
  ON acc_entries (origin_table, origin_id, origin_event)
  WHERE origin_table IS NOT NULL;

CREATE TABLE IF NOT EXISTS acc_entry_lines (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entry_id uuid NOT NULL REFERENCES acc_entries(id) ON DELETE CASCADE,
  account_id uuid NOT NULL REFERENCES acc_accounts(id),
  side char(1) NOT NULL CHECK (side IN ('D','C')),
  amount numeric NOT NULL CHECK (amount > 0),
  cost_center_id uuid REFERENCES acc_cost_centers(id)
);

-- 5) Log de auditoria
CREATE TABLE IF NOT EXISTS acc_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  detail jsonb,
  by_user uuid DEFAULT auth.uid(),
  at timestamptz NOT NULL DEFAULT now()
);

-- Índices
CREATE INDEX IF NOT EXISTS idx_acc_entries_competence ON acc_entries (competence_date);
CREATE INDEX IF NOT EXISTS idx_acc_entries_cash ON acc_entries (cash_date);
CREATE INDEX IF NOT EXISTS idx_acc_entries_status ON acc_entries (status);
CREATE INDEX IF NOT EXISTS idx_acc_lines_entry ON acc_entry_lines (entry_id);
CREATE INDEX IF NOT EXISTS idx_acc_lines_account ON acc_entry_lines (account_id);
CREATE INDEX IF NOT EXISTS idx_acc_lines_cc ON acc_entry_lines (cost_center_id);

-- RLS: contabilidade é admin-only (Fase 1)
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['acc_accounts','acc_cost_centers','acc_periods','acc_entries','acc_entry_lines','acc_logs'] LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_admin ON %I', t, t);
    EXECUTE format('CREATE POLICY %I_admin ON %I FOR ALL TO authenticated USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ''admin'')) WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = ''admin''))', t, t);
  END LOOP;
END $$;

-- Trava de período fechado
CREATE OR REPLACE FUNCTION acc_check_period_open() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM acc_periods
    WHERE year = EXTRACT(YEAR FROM NEW.competence_date)::int
      AND month = EXTRACT(MONTH FROM NEW.competence_date)::int
      AND status = 'fechado'
  ) THEN
    RAISE EXCEPTION 'Competência %/% está fechada.', EXTRACT(MONTH FROM NEW.competence_date)::int, EXTRACT(YEAR FROM NEW.competence_date)::int;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_acc_period_lock ON acc_entries;
CREATE TRIGGER trg_acc_period_lock BEFORE INSERT OR UPDATE ON acc_entries
  FOR EACH ROW EXECUTE FUNCTION acc_check_period_open();

-- RPC: grava lançamento completo (partidas dobradas) numa transação
CREATE OR REPLACE FUNCTION acc_post_entry(p jsonb) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_entry_id uuid;
  v_line jsonb;
  v_deb numeric := 0;
  v_cred numeric := 0;
  v_acc record;
BEGIN
  IF jsonb_array_length(p->'lines') < 2 THEN
    RAISE EXCEPTION 'O lançamento precisa de ao menos uma partida de débito e uma de crédito.';
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP
    SELECT * INTO v_acc FROM acc_accounts WHERE id = (v_line->>'account_id')::uuid;
    IF v_acc IS NULL THEN RAISE EXCEPTION 'Conta inexistente.'; END IF;
    IF NOT v_acc.allows_entries THEN RAISE EXCEPTION 'A conta % — % não aceita lançamento direto.', v_acc.code, v_acc.name; END IF;
    IF NOT v_acc.active THEN RAISE EXCEPTION 'A conta % — % está inativa.', v_acc.code, v_acc.name; END IF;
    IF (v_line->>'side') = 'D' THEN v_deb := v_deb + (v_line->>'amount')::numeric;
    ELSE v_cred := v_cred + (v_line->>'amount')::numeric; END IF;
  END LOOP;

  IF round(v_deb, 2) <> round(v_cred, 2) OR v_deb = 0 THEN
    RAISE EXCEPTION 'Débitos (%) e créditos (%) não conferem.', v_deb, v_cred;
  END IF;

  INSERT INTO acc_entries (competence_date, cash_date, history, document, origin, origin_table, origin_id, origin_event, cost_center_id, attachments, notes)
  VALUES (
    (p->>'competence_date')::date,
    NULLIF(p->>'cash_date','')::date,
    p->>'history',
    NULLIF(p->>'document',''),
    COALESCE(NULLIF(p->>'origin',''), 'manual'),
    NULLIF(p->>'origin_table',''),
    NULLIF(p->>'origin_id','')::uuid,
    NULLIF(p->>'origin_event',''),
    NULLIF(p->>'cost_center_id','')::uuid,
    COALESCE(p->'attachments', '[]'::jsonb),
    NULLIF(p->>'notes','')
  ) RETURNING id INTO v_entry_id;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p->'lines') LOOP
    INSERT INTO acc_entry_lines (entry_id, account_id, side, amount, cost_center_id)
    VALUES (
      v_entry_id,
      (v_line->>'account_id')::uuid,
      v_line->>'side',
      (v_line->>'amount')::numeric,
      NULLIF(v_line->>'cost_center_id','')::uuid
    );
  END LOOP;

  INSERT INTO acc_logs (action, entity, entity_id, detail)
  VALUES ('criar', 'lancamento', v_entry_id, jsonb_build_object('historico', p->>'history', 'valor', v_deb));

  RETURN v_entry_id;
END $$;

-- RPC: estorno (lançamento inverso vinculado; original nunca é excluído)
CREATE OR REPLACE FUNCTION acc_reverse_entry(p_entry_id uuid, p_reason text) RETURNS uuid
LANGUAGE plpgsql AS $$
DECLARE
  v_orig acc_entries%ROWTYPE;
  v_new uuid;
BEGIN
  SELECT * INTO v_orig FROM acc_entries WHERE id = p_entry_id;
  IF v_orig IS NULL THEN RAISE EXCEPTION 'Lançamento não encontrado.'; END IF;
  IF v_orig.status = 'estornado' THEN RAISE EXCEPTION 'Este lançamento já foi estornado.'; END IF;

  INSERT INTO acc_entries (competence_date, cash_date, history, document, origin, reversal_of, cost_center_id, notes)
  VALUES (CURRENT_DATE, CURRENT_DATE, 'ESTORNO: ' || v_orig.history, v_orig.document, 'estorno', v_orig.id, v_orig.cost_center_id, p_reason)
  RETURNING id INTO v_new;

  INSERT INTO acc_entry_lines (entry_id, account_id, side, amount, cost_center_id)
  SELECT v_new, account_id, CASE side WHEN 'D' THEN 'C' ELSE 'D' END, amount, cost_center_id
  FROM acc_entry_lines WHERE entry_id = v_orig.id;

  UPDATE acc_entries SET status = 'estornado', updated_at = now() WHERE id = v_orig.id;

  INSERT INTO acc_logs (action, entity, entity_id, detail)
  VALUES ('estornar', 'lancamento', v_orig.id, jsonb_build_object('estorno_id', v_new, 'justificativa', p_reason));

  RETURN v_new;
END $$;

-- RPC: balancete por período/regime (saldo anterior, débitos, créditos)
CREATE OR REPLACE FUNCTION acc_trial_balance(p_from date, p_to date, p_regime text DEFAULT 'competencia')
RETURNS TABLE (account_id uuid, prev_debits numeric, prev_credits numeric, debits numeric, credits numeric)
LANGUAGE sql AS $$
  SELECT
    l.account_id,
    COALESCE(SUM(l.amount) FILTER (WHERE d.dt <  p_from AND l.side='D'), 0),
    COALESCE(SUM(l.amount) FILTER (WHERE d.dt <  p_from AND l.side='C'), 0),
    COALESCE(SUM(l.amount) FILTER (WHERE d.dt >= p_from AND d.dt <= p_to AND l.side='D'), 0),
    COALESCE(SUM(l.amount) FILTER (WHERE d.dt >= p_from AND d.dt <= p_to AND l.side='C'), 0)
  FROM acc_entry_lines l
  JOIN acc_entries e ON e.id = l.entry_id
  CROSS JOIN LATERAL (SELECT CASE WHEN p_regime = 'caixa' THEN e.cash_date ELSE e.competence_date END AS dt) d
  WHERE e.status <> 'rascunho' AND d.dt IS NOT NULL AND d.dt <= p_to
  GROUP BY l.account_id
$$;

-- Seed: centros de custo padrão
INSERT INTO acc_cost_centers (name) VALUES ('Administração');
INSERT INTO acc_cost_centers (name) VALUES ('Cozinha');
INSERT INTO acc_cost_centers (name) VALUES ('Bar');
INSERT INTO acc_cost_centers (name) VALUES ('Salão');
INSERT INTO acc_cost_centers (name) VALUES ('Delivery');
INSERT INTO acc_cost_centers (name) VALUES ('Marketing');
INSERT INTO acc_cost_centers (name) VALUES ('Eventos');
INSERT INTO acc_cost_centers (name) VALUES ('Manutenção');
INSERT INTO acc_cost_centers (name) VALUES ('Diretoria');
INSERT INTO acc_cost_centers (name) VALUES ('Estoque');

-- Seed: plano de contas padrão de restaurante
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1','ATIVO','ativo','D',NULL,1,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.1','Caixa e Equivalentes','ativo','D',(SELECT id FROM acc_accounts WHERE code='1'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.1.1','Caixa do restaurante','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.1.2','Caixa do delivery','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.1.3','Bancos','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.1.4','Contas digitais','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.2','Valores a Receber','ativo','D',(SELECT id FROM acc_accounts WHERE code='1'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.2.1','Cartões a receber','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.2.2','PIX a receber','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.2.3','Clientes a receber','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.3','Estoques','ativo','D',(SELECT id FROM acc_accounts WHERE code='1'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.3.1','Estoque de alimentos','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.3.2','Estoque de bebidas','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.3.3','Estoque de embalagens','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.3.4','Estoque de materiais de limpeza','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.4','Adiantamentos','ativo','D',(SELECT id FROM acc_accounts WHERE code='1'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.4.1','Adiantamentos concedidos','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.5','Imobilizado','ativo','D',(SELECT id FROM acc_accounts WHERE code='1'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.5.1','Equipamentos de cozinha','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.5.2','Móveis e utensílios','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.5.3','Computadores e sistemas','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.5.4','Veículos','ativo','D',(SELECT id FROM acc_accounts WHERE code='1.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('1.5.5','(-) Depreciação acumulada','ativo','C',(SELECT id FROM acc_accounts WHERE code='1.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2','PASSIVO','passivo','C',NULL,1,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.1','Fornecedores','passivo','C',(SELECT id FROM acc_accounts WHERE code='2'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.1.1','Fornecedores a pagar','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.2','Obrigações Trabalhistas','passivo','C',(SELECT id FROM acc_accounts WHERE code='2'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.2.1','Salários a pagar','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.2.2','Encargos trabalhistas a pagar','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.2.3','FGTS a pagar','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.2.4','INSS a pagar','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.3','Obrigações Fiscais','passivo','C',(SELECT id FROM acc_accounts WHERE code='2'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.3.1','Impostos a pagar','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.3.2','Simples Nacional a pagar','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.4','Empréstimos e Financiamentos','passivo','C',(SELECT id FROM acc_accounts WHERE code='2'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.4.1','Empréstimos','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.4.2','Financiamentos','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.4.3','Parcelamentos','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.5','Outras Obrigações','passivo','C',(SELECT id FROM acc_accounts WHERE code='2'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.5.1','Aluguéis a pagar','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.5.2','Contas de consumo a pagar','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('2.5.3','Adiantamentos de clientes','passivo','C',(SELECT id FROM acc_accounts WHERE code='2.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3','PATRIMÔNIO LÍQUIDO','pl','C',NULL,1,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3.1','Capital','pl','C',(SELECT id FROM acc_accounts WHERE code='3'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3.1.1','Capital social','pl','C',(SELECT id FROM acc_accounts WHERE code='3.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3.2','Reservas','pl','C',(SELECT id FROM acc_accounts WHERE code='3'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3.2.1','Reservas','pl','C',(SELECT id FROM acc_accounts WHERE code='3.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3.3','Resultados','pl','C',(SELECT id FROM acc_accounts WHERE code='3'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3.3.1','Lucros acumulados','pl','C',(SELECT id FROM acc_accounts WHERE code='3.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3.3.2','(-) Prejuízos acumulados','pl','D',(SELECT id FROM acc_accounts WHERE code='3.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3.3.3','(-) Distribuição de lucros','pl','D',(SELECT id FROM acc_accounts WHERE code='3.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('3.3.4','(-) Retiradas de sócios','pl','D',(SELECT id FROM acc_accounts WHERE code='3.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4','RECEITAS','receita','C',NULL,1,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1','Receita de Vendas','receita','C',(SELECT id FROM acc_accounts WHERE code='4'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1.1','Venda de alimentos','receita','C',(SELECT id FROM acc_accounts WHERE code='4.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1.2','Venda de bebidas','receita','C',(SELECT id FROM acc_accounts WHERE code='4.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1.3','Venda de pizzas','receita','C',(SELECT id FROM acc_accounts WHERE code='4.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1.4','Venda de lanches','receita','C',(SELECT id FROM acc_accounts WHERE code='4.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1.5','Venda de pratos executivos','receita','C',(SELECT id FROM acc_accounts WHERE code='4.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1.6','Venda de sobremesas','receita','C',(SELECT id FROM acc_accounts WHERE code='4.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1.7','Venda de porções','receita','C',(SELECT id FROM acc_accounts WHERE code='4.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1.8','Venda de drinks','receita','C',(SELECT id FROM acc_accounts WHERE code='4.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.1.9','Venda de chopp','receita','C',(SELECT id FROM acc_accounts WHERE code='4.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.2','Outras Receitas Operacionais','receita','C',(SELECT id FROM acc_accounts WHERE code='4'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.2.1','Taxa de serviço','receita','C',(SELECT id FROM acc_accounts WHERE code='4.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.2.2','Couvert artístico','receita','C',(SELECT id FROM acc_accounts WHERE code='4.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.2.3','Eventos','receita','C',(SELECT id FROM acc_accounts WHERE code='4.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.2.4','Delivery','receita','C',(SELECT id FROM acc_accounts WHERE code='4.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.2.5','Outras receitas','receita','C',(SELECT id FROM acc_accounts WHERE code='4.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.3','(-) Deduções da Receita','receita','D',(SELECT id FROM acc_accounts WHERE code='4'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.3.1','Descontos concedidos','receita','D',(SELECT id FROM acc_accounts WHERE code='4.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.3.2','Cancelamentos','receita','D',(SELECT id FROM acc_accounts WHERE code='4.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('4.3.3','Devoluções','receita','D',(SELECT id FROM acc_accounts WHERE code='4.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5','CUSTOS','custo','D',NULL,1,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.1','Custo da Mercadoria Vendida','custo','D',(SELECT id FROM acc_accounts WHERE code='5'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.1.1','Custo de alimentos vendidos','custo','D',(SELECT id FROM acc_accounts WHERE code='5.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.1.2','Custo de bebidas vendidas','custo','D',(SELECT id FROM acc_accounts WHERE code='5.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.1.3','Custo de embalagens','custo','D',(SELECT id FROM acc_accounts WHERE code='5.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.1.4','Custo de insumos','custo','D',(SELECT id FROM acc_accounts WHERE code='5.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.2','Perdas e Ajustes de Estoque','custo','D',(SELECT id FROM acc_accounts WHERE code='5'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.2.1','Perdas de estoque','custo','D',(SELECT id FROM acc_accounts WHERE code='5.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.2.2','Quebras','custo','D',(SELECT id FROM acc_accounts WHERE code='5.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.2.3','Desperdícios','custo','D',(SELECT id FROM acc_accounts WHERE code='5.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.2.4','Consumo interno','custo','D',(SELECT id FROM acc_accounts WHERE code='5.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.2.5','Cortesias','custo','D',(SELECT id FROM acc_accounts WHERE code='5.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.3','Custos de Canal','custo','D',(SELECT id FROM acc_accounts WHERE code='5'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.3.1','Taxas de aplicativos de delivery','custo','D',(SELECT id FROM acc_accounts WHERE code='5.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('5.3.2','Taxas de cartão','custo','D',(SELECT id FROM acc_accounts WHERE code='5.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6','DESPESAS','despesa','D',NULL,1,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.1','Despesas com Pessoal','despesa','D',(SELECT id FROM acc_accounts WHERE code='6'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.1.1','Salários','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.1.2','Pró-labore','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.1.3','Férias','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.1.4','Décimo terceiro','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.1.5','Encargos trabalhistas','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.1.6','Benefícios','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.1.7','Vale-transporte','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.1.8','Alimentação de funcionários','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.1'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.2','Despesas de Ocupação','despesa','D',(SELECT id FROM acc_accounts WHERE code='6'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.2.1','Aluguel','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.2.2','Condomínio','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.2.3','Energia elétrica','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.2.4','Água','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.2.5','Gás','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.2.6','Internet','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.2.7','Telefonia','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.2'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.3','Despesas Comerciais','despesa','D',(SELECT id FROM acc_accounts WHERE code='6'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.3.1','Marketing','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.3.2','Tráfego pago','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.3'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.4','Despesas Administrativas','despesa','D',(SELECT id FROM acc_accounts WHERE code='6'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.4.1','Manutenção','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.4.2','Limpeza','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.4.3','Segurança','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.4.4','Contabilidade','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.4.5','Sistemas e softwares','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.4.6','Material de escritório','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.4.7','Material de limpeza','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.4.8','Honorários','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.4'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.5','Despesas Financeiras','despesa','D',(SELECT id FROM acc_accounts WHERE code='6'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.5.1','Multas','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.5.2','Juros','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.5.3','Despesas bancárias','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.5'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.6','Despesas Tributárias','despesa','D',(SELECT id FROM acc_accounts WHERE code='6'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.6.1','Impostos','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.6'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.7','Outras Despesas','despesa','D',(SELECT id FROM acc_accounts WHERE code='6'),2,false);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.7.1','Depreciação','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.7'),3,true);
INSERT INTO acc_accounts (code, name, kind, nature, parent_id, level, allows_entries) VALUES ('6.7.2','Outras despesas operacionais','despesa','D',(SELECT id FROM acc_accounts WHERE code='6.7'),3,true);
