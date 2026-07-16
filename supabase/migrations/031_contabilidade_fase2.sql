-- Contabilidade — Fase 2
-- 1) Integração automática de vendas: comanda/pedido pago gera lançamento de
--    receita (split alimentos × bebidas pela categoria) e de CMV (custo dos
--    produtos × estoque). Vendas entram já contabilizadas (dados objetivos);
--    o financeiro continua entrando pendente para validação.
-- 2) acc_settings (faixas de indicadores configuráveis).
-- 3) RPCs de agregação para DRE, série mensal e fluxo de caixa.

-- Configurações contábeis
CREATE TABLE IF NOT EXISTS acc_settings (
  key text PRIMARY KEY,
  value jsonb NOT NULL
);
ALTER TABLE acc_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS acc_settings_admin ON acc_settings;
CREATE POLICY acc_settings_admin ON acc_settings FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

INSERT INTO acc_settings (key, value) VALUES ('indicador_faixas', '{
  "cmv": {"bom": 30, "atencao": 35},
  "folha": {"bom": 25, "atencao": 35},
  "ocupacao": {"bom": 10, "atencao": 15},
  "margem_liquida": {"bom": 10, "atencao": 5}
}'::jsonb) ON CONFLICT (key) DO NOTHING;

-- Venda paga → receita + CMV
CREATE OR REPLACE FUNCTION acc_post_sale() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_rev_beb numeric; v_rev_ali numeric; v_cost_beb numeric; v_cost_ali numeric;
  v_total numeric; v_cost_total numeric;
  v_cash uuid; v_acc_beb uuid; v_acc_ali uuid;
  v_est_beb uuid; v_est_ali uuid; v_cmv_beb uuid; v_cmv_ali uuid;
  v_entry uuid; v_dt date; v_hist text;
BEGIN
  IF NEW.status <> 'paid' OR (TG_OP = 'UPDATE' AND OLD.status = 'paid') THEN RETURN NEW; END IF;

  SELECT
    COALESCE(SUM(CASE WHEN c.name ~* 'cervej|bebida|drink|chopp|refri|suco|água|agua|vinho|dose|long neck' THEN oi.unit_price * oi.quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.name ~* 'cervej|bebida|drink|chopp|refri|suco|água|agua|vinho|dose|long neck' THEN 0 ELSE oi.unit_price * oi.quantity END), 0),
    COALESCE(SUM(CASE WHEN c.name ~* 'cervej|bebida|drink|chopp|refri|suco|água|agua|vinho|dose|long neck' THEN COALESCE(p.cost_price, 0) * oi.quantity ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN c.name ~* 'cervej|bebida|drink|chopp|refri|suco|água|agua|vinho|dose|long neck' THEN 0 ELSE COALESCE(p.cost_price, 0) * oi.quantity END), 0)
  INTO v_rev_beb, v_rev_ali, v_cost_beb, v_cost_ali
  FROM order_items oi
  LEFT JOIN products p ON p.id = oi.product_id
  LEFT JOIN categories c ON c.id = p.category_id
  WHERE oi.order_id = NEW.id;

  v_total := v_rev_beb + v_rev_ali;
  v_cost_total := v_cost_beb + v_cost_ali;
  IF v_total <= 0 THEN RETURN NEW; END IF;

  v_dt := COALESCE(NEW.closed_at::date, CURRENT_DATE);
  v_hist := CASE WHEN NEW.order_type = 'pedido'
    THEN 'Venda — Pedido online #' || upper(substr(replace(NEW.id::text, '-', ''), 1, 4))
    ELSE 'Venda — Comanda ' || COALESCE(NEW.table_number::text, '') END;

  SELECT id INTO v_cash FROM acc_accounts WHERE code = CASE WHEN NEW.order_type = 'pedido' THEN '1.1.2' ELSE '1.1.1' END;
  SELECT id INTO v_acc_beb FROM acc_accounts WHERE code = '4.1.2';
  SELECT id INTO v_acc_ali FROM acc_accounts WHERE code = '4.1.1';
  SELECT id INTO v_est_beb FROM acc_accounts WHERE code = '1.3.2';
  SELECT id INTO v_est_ali FROM acc_accounts WHERE code = '1.3.1';
  SELECT id INTO v_cmv_beb FROM acc_accounts WHERE code = '5.1.2';
  SELECT id INTO v_cmv_ali FROM acc_accounts WHERE code = '5.1.1';
  IF v_cash IS NULL THEN RETURN NEW; END IF;

  -- Receita
  BEGIN
    INSERT INTO acc_entries (competence_date, cash_date, history, origin, origin_table, origin_id, origin_event, status)
    VALUES (v_dt, v_dt, v_hist, 'venda', 'orders', NEW.id, 'venda', 'contabilizado')
    RETURNING id INTO v_entry;
    INSERT INTO acc_entry_lines (entry_id, account_id, side, amount)
      VALUES (v_entry, v_cash, 'D', v_total);
    IF v_rev_beb > 0 THEN INSERT INTO acc_entry_lines (entry_id, account_id, side, amount) VALUES (v_entry, v_acc_beb, 'C', v_rev_beb); END IF;
    IF v_rev_ali > 0 THEN INSERT INTO acc_entry_lines (entry_id, account_id, side, amount) VALUES (v_entry, v_acc_ali, 'C', v_rev_ali); END IF;
  EXCEPTION WHEN unique_violation THEN NULL;
  END;

  -- CMV (só quando há custo cadastrado)
  IF v_cost_total > 0 THEN
    BEGIN
      INSERT INTO acc_entries (competence_date, cash_date, history, origin, origin_table, origin_id, origin_event, status)
      VALUES (v_dt, v_dt, 'CMV — ' || v_hist, 'cmv', 'orders', NEW.id, 'cmv', 'contabilizado')
      RETURNING id INTO v_entry;
      IF v_cost_beb > 0 THEN
        INSERT INTO acc_entry_lines (entry_id, account_id, side, amount) VALUES (v_entry, v_cmv_beb, 'D', v_cost_beb);
        INSERT INTO acc_entry_lines (entry_id, account_id, side, amount) VALUES (v_entry, v_est_beb, 'C', v_cost_beb);
      END IF;
      IF v_cost_ali > 0 THEN
        INSERT INTO acc_entry_lines (entry_id, account_id, side, amount) VALUES (v_entry, v_cmv_ali, 'D', v_cost_ali);
        INSERT INTO acc_entry_lines (entry_id, account_id, side, amount) VALUES (v_entry, v_est_ali, 'C', v_cost_ali);
      END IF;
    EXCEPTION WHEN unique_violation THEN NULL;
    END;
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_acc_sale ON orders;
CREATE TRIGGER trg_acc_sale AFTER UPDATE ON orders
  FOR EACH ROW EXECUTE FUNCTION acc_post_sale();

-- DRE: saldos por bloco no período (sinal pela natureza da conta)
CREATE OR REPLACE FUNCTION acc_dre(p_from date, p_to date, p_regime text DEFAULT 'competencia')
RETURNS TABLE (bucket text, amount numeric)
LANGUAGE sql AS $$
  WITH sums AS (
    SELECT a.code,
      SUM(CASE WHEN l.side = a.nature THEN l.amount ELSE -l.amount END) AS bal
    FROM acc_entry_lines l
    JOIN acc_entries e ON e.id = l.entry_id
    JOIN acc_accounts a ON a.id = l.account_id
    CROSS JOIN LATERAL (SELECT CASE WHEN p_regime = 'caixa' THEN e.cash_date ELSE e.competence_date END AS dt) d
    WHERE e.status NOT IN ('rascunho','pendente') AND d.dt BETWEEN p_from AND p_to
    GROUP BY a.code
  )
  SELECT b.bucket, COALESCE(SUM(s.bal), 0)
  FROM (VALUES
    ('receita_vendas', '4.1'), ('outras_receitas', '4.2'), ('deducoes', '4.3'),
    ('cmv', '5.1'), ('perdas', '5.2'), ('taxas_canal', '5.3'),
    ('pessoal', '6.1'), ('ocupacao', '6.2'), ('comercial', '6.3'),
    ('administrativas', '6.4'), ('financeiras', '6.5'), ('tributarias', '6.6'), ('outras_despesas', '6.7')
  ) AS b(bucket, prefix)
  LEFT JOIN sums s ON s.code = b.prefix OR s.code LIKE b.prefix || '.%'
  GROUP BY b.bucket
$$;

-- Série mensal dos blocos (para gráficos/comparativos)
CREATE OR REPLACE FUNCTION acc_dre_series(p_months int DEFAULT 12, p_regime text DEFAULT 'competencia')
RETURNS TABLE (month date, bucket text, amount numeric)
LANGUAGE sql AS $$
  WITH sums AS (
    SELECT date_trunc('month', d.dt)::date AS m, a.code,
      SUM(CASE WHEN l.side = a.nature THEN l.amount ELSE -l.amount END) AS bal
    FROM acc_entry_lines l
    JOIN acc_entries e ON e.id = l.entry_id
    JOIN acc_accounts a ON a.id = l.account_id
    CROSS JOIN LATERAL (SELECT CASE WHEN p_regime = 'caixa' THEN e.cash_date ELSE e.competence_date END AS dt) d
    WHERE e.status NOT IN ('rascunho','pendente')
      AND d.dt >= date_trunc('month', CURRENT_DATE) - make_interval(months => p_months - 1)
    GROUP BY 1, 2
  )
  SELECT s.m, b.bucket, COALESCE(SUM(s.bal), 0)
  FROM (VALUES
    ('receita_vendas', '4.1'), ('outras_receitas', '4.2'), ('deducoes', '4.3'),
    ('cmv', '5.1'), ('perdas', '5.2'), ('taxas_canal', '5.3'),
    ('pessoal', '6.1'), ('ocupacao', '6.2'), ('comercial', '6.3'),
    ('administrativas', '6.4'), ('financeiras', '6.5'), ('tributarias', '6.6'), ('outras_despesas', '6.7')
  ) AS b(bucket, prefix)
  JOIN sums s ON s.code = b.prefix OR s.code LIKE b.prefix || '.%'
  GROUP BY s.m, b.bucket
$$;

-- Fluxo de caixa realizado: movimentos diários nas contas de caixa (1.1.x)
CREATE OR REPLACE FUNCTION acc_cash_flow(p_from date, p_to date)
RETURNS TABLE (day date, account_code text, inflow numeric, outflow numeric)
LANGUAGE sql AS $$
  SELECT e.cash_date, a.code,
    COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'D'), 0),
    COALESCE(SUM(l.amount) FILTER (WHERE l.side = 'C'), 0)
  FROM acc_entry_lines l
  JOIN acc_entries e ON e.id = l.entry_id
  JOIN acc_accounts a ON a.id = l.account_id
  WHERE e.status NOT IN ('rascunho','pendente')
    AND a.code LIKE '1.1.%'
    AND e.cash_date BETWEEN p_from AND p_to
  GROUP BY e.cash_date, a.code
  ORDER BY e.cash_date
$$;

-- Fluxo por contrapartida (categorias de entrada/saída no período)
CREATE OR REPLACE FUNCTION acc_cash_flow_categories(p_from date, p_to date)
RETURNS TABLE (direction text, group_code text, group_name text, total numeric)
LANGUAGE sql AS $$
  WITH cash_entries AS (
    SELECT DISTINCT e.id,
      SUM(CASE WHEN l.side = 'D' THEN l.amount ELSE -l.amount END) AS cash_delta
    FROM acc_entries e
    JOIN acc_entry_lines l ON l.entry_id = e.id
    JOIN acc_accounts a ON a.id = l.account_id
    WHERE e.status NOT IN ('rascunho','pendente')
      AND a.code LIKE '1.1.%'
      AND e.cash_date BETWEEN p_from AND p_to
    GROUP BY e.id
  )
  SELECT
    CASE WHEN ce.cash_delta >= 0 THEN 'entrada' ELSE 'saida' END,
    split_part(a.code, '.', 1) || '.' || split_part(a.code, '.', 2),
    COALESCE(pg.name, a.name),
    SUM(l.amount)
  FROM cash_entries ce
  JOIN acc_entry_lines l ON l.entry_id = ce.id
  JOIN acc_accounts a ON a.id = l.account_id
  LEFT JOIN acc_accounts pg ON pg.code = split_part(a.code, '.', 1) || '.' || split_part(a.code, '.', 2)
  WHERE a.code NOT LIKE '1.1.%'
  GROUP BY 1, 2, 3
  ORDER BY 4 DESC
$$;
