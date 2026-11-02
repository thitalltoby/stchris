// Integration tests run against a dedicated database. Never point this at development or production data.
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? 'postgresql://stchris:stchris_dev@localhost:5432/stchris_test';
process.env.APP_SECRET = 'test-secret-test-secret-test-secret-123456';
process.env.APP_URL = 'http://localhost:3000';
process.env.STORAGE_DIR = '/tmp/stchris-test-storage';
process.env.AUTH_REQUIRE_EMAIL_VERIFICATION = 'true';
process.env.RESEND_API_KEY = '';
process.env.SMTP_HOST = '';
(process.env as Record<string, string>).NODE_ENV = 'test';
