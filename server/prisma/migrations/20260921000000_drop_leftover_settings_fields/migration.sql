ALTER TABLE "UserSettings" DROP COLUMN IF EXISTS "sidebarNav";

ALTER TABLE "SystemSetting"
  DROP COLUMN IF EXISTS "siteUiSkin",
  DROP COLUMN IF EXISTS "sub2apiLoginEnabled",
  DROP COLUMN IF EXISTS "sub2apiBaseUrl",
  DROP COLUMN IF EXISTS "sub2apiClientId",
  DROP COLUMN IF EXISTS "encryptedSub2apiClientSecret",
  DROP COLUMN IF EXISTS "sub2apiClientSecretHint",
  DROP COLUMN IF EXISTS "sub2apiRedirectUrl",
  DROP COLUMN IF EXISTS "sub2apiScopes",
  DROP COLUMN IF EXISTS "sub2apiAuthorizeUrl",
  DROP COLUMN IF EXISTS "sub2apiTokenUrl",
  DROP COLUMN IF EXISTS "sub2apiUserInfoUrl";
