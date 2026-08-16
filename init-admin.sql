DO $$
DECLARE
  new_user_id UUID := gen_random_uuid();
  new_settings_id UUID := gen_random_uuid();
  new_credit_id UUID := gen_random_uuid();
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "User" WHERE email = 'admin@xinyue.mom') THEN
    INSERT INTO "User" (id, email, "displayName", "passwordHash", "emailVerifiedAt", role, status, "createdAt", "updatedAt")
    VALUES (new_user_id, 'admin@xinyue.mom', 'Admin', 'scrypt$Yq0skH76pDFJGPDLRHU2OA$m0IZmuNPl4FQWhqmX1tQ4Jig46JBVnsWfiNLUD6etCc6wTXvXzxETktSCPfg3MNggMBnIcRv73kt-Bvlh49_4A', now(), 'SUPER_ADMIN', 'ACTIVE', now(), now());

    INSERT INTO "UserSettings" (id, "userId", "createdAt", "updatedAt")
    VALUES (new_settings_id, new_user_id, now(), now());

    INSERT INTO "CreditAccount" (id, "userId", balance, "createdAt", "updatedAt")
    VALUES (new_credit_id, new_user_id, 0, now(), now());

    RAISE NOTICE 'Admin user created: admin@xinyue.mom';
  ELSE
    RAISE NOTICE 'Admin user already exists, skipping.';
  END IF;
END $$;
