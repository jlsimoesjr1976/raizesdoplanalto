-- Contabilidade — Fase 4: orçamento/metas por conta e comparativo

CREATE TABLE IF NOT EXISTS acc_budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  account_id uuid NOT NULL REFERENCES acc_accounts(id) ON DELETE CASCADE,
  year int NOT NULL,
  month int NOT NULL CHECK (month BETWEEN 1 AND 12),
  amount numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz,
  UNIQUE (account_id, year, month)
);
CREATE INDEX IF NOT EXISTS idx_acc_budgets_period ON acc_budgets (year, month);
ALTER TABLE acc_budgets ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acc_budgets_admin ON acc_budgets;
CREATE POLICY acc_budgets_admin ON acc_budgets FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Orçamento somado por mês e por tipo de conta (kind) — para o gráfico realizado x orçado
CREATE OR REPLACE FUNCTION acc_budget_totals(p_year int)
RETURNS TABLE (month int, kind text, budgeted numeric)
LANGUAGE sql AS $$
  SELECT b.month, a.kind, SUM(b.amount)
  FROM acc_budgets b
  JOIN acc_accounts a ON a.id = b.account_id
  WHERE b.year = p_year
  GROUP BY b.month, a.kind
$$;
