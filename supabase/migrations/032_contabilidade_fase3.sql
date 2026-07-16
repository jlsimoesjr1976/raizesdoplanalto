-- Contabilidade — Fase 3: fechamento mensal e conciliação

-- Conciliação (caixa, banco, pix, cartão, delivery)
CREATE TABLE IF NOT EXISTS acc_reconciliations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('caixa','banco','pix','cartao','delivery')),
  ref_month date NOT NULL,                 -- 1º dia do mês de referência
  description text,
  expected numeric NOT NULL DEFAULT 0,     -- valor registrado no sistema
  actual numeric,                          -- valor efetivamente recebido/conferido
  fee numeric NOT NULL DEFAULT 0,          -- taxa (cartão/apps)
  expected_date date,
  actual_date date,
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','conciliado','divergente','nao_localizado')),
  notes text,
  created_by uuid DEFAULT auth.uid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz
);
CREATE INDEX IF NOT EXISTS idx_acc_recon_month ON acc_reconciliations (ref_month, kind);
ALTER TABLE acc_reconciliations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acc_reconciliations_admin ON acc_reconciliations;
CREATE POLICY acc_reconciliations_admin ON acc_reconciliations FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

-- Fechar competência: valida pendências e a equação patrimonial antes
CREATE OR REPLACE FUNCTION acc_close_period(p_year int, p_month int) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE
  v_from date := make_date(p_year, p_month, 1);
  v_to date := (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date;
  v_pend int;
  v_diff numeric;
BEGIN
  SELECT count(*) INTO v_pend FROM acc_entries
  WHERE competence_date BETWEEN v_from AND v_to AND status IN ('rascunho','pendente');
  IF v_pend > 0 THEN
    RAISE EXCEPTION 'Há % lançamento(s) pendente(s) de validação na competência. Contabilize, ajuste ou descarte antes de fechar.', v_pend;
  END IF;

  -- Equação: Ativo = Passivo + PL + Resultado (acumulado até o fim do mês)
  SELECT COALESCE(SUM(
    CASE
      WHEN a.kind = 'ativo' THEN CASE WHEN l.side = a.nature THEN l.amount ELSE -l.amount END
      WHEN a.kind IN ('passivo','pl','receita') THEN -(CASE WHEN l.side = a.nature THEN l.amount ELSE -l.amount END)
      WHEN a.kind IN ('custo','despesa') THEN CASE WHEN l.side = a.nature THEN l.amount ELSE -l.amount END
      ELSE 0
    END), 0)
  INTO v_diff
  FROM acc_entry_lines l
  JOIN acc_entries e ON e.id = l.entry_id
  JOIN acc_accounts a ON a.id = l.account_id
  WHERE e.status NOT IN ('rascunho','pendente') AND e.competence_date <= v_to;

  IF round(v_diff, 2) <> 0 THEN
    RAISE EXCEPTION 'Divergência patrimonial de R$ % — Ativo ≠ Passivo + PL + Resultado. Corrija antes de fechar (veja o Balancete > Ver inconsistências).', round(v_diff, 2);
  END IF;

  INSERT INTO acc_periods (year, month, status, closed_by, closed_at)
  VALUES (p_year, p_month, 'fechado', auth.uid(), now())
  ON CONFLICT (year, month) DO UPDATE
    SET status = 'fechado', closed_by = auth.uid(), closed_at = now();

  INSERT INTO acc_logs (action, entity, entity_id, detail)
  VALUES ('fechar_competencia', 'periodo', NULL, jsonb_build_object('ano', p_year, 'mes', p_month));
END $$;

-- Reabrir competência: exige justificativa, registra em log
CREATE OR REPLACE FUNCTION acc_reopen_period(p_year int, p_month int, p_reason text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_reason IS NULL OR length(trim(p_reason)) < 5 THEN
    RAISE EXCEPTION 'Informe uma justificativa para reabrir a competência.';
  END IF;

  UPDATE acc_periods SET status = 'reaberto', reopen_reason = p_reason
  WHERE year = p_year AND month = p_month AND status = 'fechado';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'A competência %/% não está fechada.', p_month, p_year;
  END IF;

  INSERT INTO acc_logs (action, entity, entity_id, detail)
  VALUES ('reabrir_competencia', 'periodo', NULL, jsonb_build_object('ano', p_year, 'mes', p_month, 'justificativa', p_reason));
END $$;

-- Resumo da competência para o checklist de fechamento
CREATE OR REPLACE FUNCTION acc_period_summary(p_year int, p_month int)
RETURNS TABLE (vendas bigint, vendas_total numeric, baixas bigint, lancamentos bigint, pendentes bigint, estornos bigint)
LANGUAGE sql AS $$
  WITH r AS (
    SELECT make_date(p_year, p_month, 1) AS f,
           (make_date(p_year, p_month, 1) + interval '1 month - 1 day')::date AS t
  )
  SELECT
    (SELECT count(*) FROM orders o, r WHERE o.status = 'paid' AND o.closed_at::date BETWEEN r.f AND r.t),
    COALESCE((SELECT SUM(o.total) FROM orders o, r WHERE o.status = 'paid' AND o.closed_at::date BETWEEN r.f AND r.t), 0),
    (SELECT count(*) FROM financial_entries fe, r WHERE fe.paid AND fe.paid_at::date BETWEEN r.f AND r.t),
    (SELECT count(*) FROM acc_entries e, r WHERE e.competence_date BETWEEN r.f AND r.t AND e.status = 'contabilizado'),
    (SELECT count(*) FROM acc_entries e, r WHERE e.competence_date BETWEEN r.f AND r.t AND e.status IN ('rascunho','pendente')),
    (SELECT count(*) FROM acc_entries e, r WHERE e.competence_date BETWEEN r.f AND r.t AND e.status = 'estornado')
$$;
