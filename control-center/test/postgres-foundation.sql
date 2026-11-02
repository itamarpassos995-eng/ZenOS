-- Integration smoke test in a disposable PostgreSQL database. No customer data.
BEGIN;
INSERT INTO organizations(firebase_uid,display_name,country) VALUES ('test-loja-00001','Empresa Teste','PY');
DO $$
BEGIN
  BEGIN
    INSERT INTO organizations(firebase_uid,display_name,country) VALUES ('test-loja-00001','Duplicata','BR');
    RAISE EXCEPTION 'DUPLICATE_ORGANIZATION_WAS_ALLOWED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
INSERT INTO plans(code,title) VALUES ('basic-test','Básico Teste');
INSERT INTO modules(code,title) VALUES ('pdv-test','PDV Teste');
INSERT INTO subscriptions(organization_id,plan_id,status,starts_at)
SELECT o.id,p.id,'trial',now() FROM organizations o CROSS JOIN plans p WHERE o.firebase_uid='test-loja-00001' AND p.code='basic-test';
INSERT INTO invoices(organization_id,currency,total,due_at,status)
SELECT id,'PYG',45000,now() + INTERVAL '7 days','issued' FROM organizations WHERE firebase_uid='test-loja-00001';
DO $$
BEGIN
  BEGIN
    INSERT INTO invoices(organization_id,currency,total,due_at,status)
    SELECT id,'PYG',-10,now(),'issued' FROM organizations WHERE firebase_uid='test-loja-00001';
    RAISE EXCEPTION 'NEGATIVE_INVOICE_WAS_ALLOWED';
  EXCEPTION WHEN check_violation THEN NULL;
  END;
END $$;
INSERT INTO inbox_events(event_id,event_type,organization_uid,payload)
VALUES('evt-test-000001','organization.registered.v1','test-loja-00001','{"displayName":"Empresa Teste"}');
DO $$
BEGIN
  BEGIN
    INSERT INTO inbox_events(event_id,event_type,organization_uid,payload)
    VALUES('evt-test-000001','organization.registered.v1','test-loja-00001','{}');
    RAISE EXCEPTION 'DUPLICATE_EVENT_WAS_ALLOWED';
  EXCEPTION WHEN unique_violation THEN NULL;
  END;
END $$;
DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM subscriptions WHERE status='trial';
  IF n <> 1 THEN RAISE EXCEPTION 'WRONG_TRIAL_COUNT: %',n; END IF;
  SELECT count(*) INTO n FROM organizations WHERE firebase_uid='test-loja-00001';
  IF n <> 1 THEN RAISE EXCEPTION 'WRONG_ORG_COUNT: %',n; END IF;
END $$;
ROLLBACK;
