-- Integração Financeiro → Contabilidade
-- A baixa de um Pagamento/Recebimento gera automaticamente um lançamento
-- contábil com status 'pendente', para o admin validar, ajustar ou descartar
-- na tela de Lançamentos. O índice único de origem impede duplicidade.

-- Sugestões pendentes não entram no balancete
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
  WHERE e.status NOT IN ('rascunho','pendente') AND d.dt IS NOT NULL AND d.dt <= p_to
  GROUP BY l.account_id
$$;

-- Conta de caixa/banco conforme a forma de pagamento
CREATE OR REPLACE FUNCTION acc_cash_account(p_method text) RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT id FROM acc_accounts
  WHERE code = CASE WHEN p_method = 'dinheiro' THEN '1.1.1' ELSE '1.1.3' END
$$;

-- Gera a sugestão de lançamento a partir de um financial_entry baixado
CREATE OR REPLACE FUNCTION acc_suggest_from_financial(p_fe financial_entries) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE
  v_entry_id uuid;
  v_amount numeric;
  v_cash uuid;
  v_other uuid;
  v_hist text;
BEGIN
  IF NOT p_fe.paid THEN RETURN; END IF;

  v_amount := COALESCE(p_fe.final_amount, p_fe.amount);
  IF v_amount IS NULL OR v_amount <= 0 THEN RETURN; END IF;

  v_cash := acc_cash_account(p_fe.payment_method);
  IF p_fe.type = 'payment' THEN
    SELECT id INTO v_other FROM acc_accounts WHERE code = '6.7.2'; -- Outras despesas operacionais
    v_hist := 'Pagamento: ' || p_fe.description || COALESCE(' — ' || p_fe.beneficiary_name, '');
  ELSE
    SELECT id INTO v_other FROM acc_accounts WHERE code = '4.2.5'; -- Outras receitas
    v_hist := 'Recebimento: ' || p_fe.description;
  END IF;
  IF v_cash IS NULL OR v_other IS NULL THEN RETURN; END IF;

  BEGIN
    INSERT INTO acc_entries (competence_date, cash_date, history, origin, origin_table, origin_id, origin_event, status, notes)
    VALUES (
      p_fe.entry_date,
      COALESCE(p_fe.paid_at::date, CURRENT_DATE),
      v_hist,
      'financeiro',
      'financial_entries',
      p_fe.id,
      'baixa',
      'pendente',
      'Gerado automaticamente pela baixa no Financeiro. Valide ou ajuste a classificação.'
    ) RETURNING id INTO v_entry_id;
  EXCEPTION WHEN unique_violation THEN
    RETURN; -- sugestão já existe para esta baixa
  END;

  IF p_fe.type = 'payment' THEN
    INSERT INTO acc_entry_lines (entry_id, account_id, side, amount) VALUES
      (v_entry_id, v_other, 'D', v_amount),
      (v_entry_id, v_cash, 'C', v_amount);
  ELSE
    INSERT INTO acc_entry_lines (entry_id, account_id, side, amount) VALUES
      (v_entry_id, v_cash, 'D', v_amount),
      (v_entry_id, v_other, 'C', v_amount);
  END IF;

  INSERT INTO acc_logs (action, entity, entity_id, detail)
  VALUES ('sugestao_automatica', 'lancamento', v_entry_id, jsonb_build_object('financial_entry', p_fe.id, 'valor', v_amount));
END $$;

-- Trigger: baixa gera sugestão; reabertura/exclusão remove sugestão pendente
CREATE OR REPLACE FUNCTION trg_acc_financial_fn() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    DELETE FROM acc_entries
    WHERE origin_table = 'financial_entries' AND origin_id = OLD.id AND status = 'pendente';
    RETURN OLD;
  END IF;

  IF NEW.paid AND (TG_OP = 'INSERT' OR OLD.paid IS DISTINCT FROM NEW.paid) THEN
    PERFORM acc_suggest_from_financial(NEW);
  ELSIF NOT NEW.paid AND TG_OP = 'UPDATE' AND OLD.paid THEN
    -- baixa desfeita: remove a sugestão se ainda não foi contabilizada
    DELETE FROM acc_entries
    WHERE origin_table = 'financial_entries' AND origin_id = NEW.id AND status = 'pendente';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_acc_financial ON financial_entries;
CREATE TRIGGER trg_acc_financial
  AFTER INSERT OR UPDATE OR DELETE ON financial_entries
  FOR EACH ROW EXECUTE FUNCTION trg_acc_financial_fn();

-- Backfill: gera sugestões para as baixas já existentes
DO $$
DECLARE r financial_entries%ROWTYPE;
BEGIN
  FOR r IN SELECT * FROM financial_entries WHERE paid LOOP
    PERFORM acc_suggest_from_financial(r);
  END LOOP;
END $$;
