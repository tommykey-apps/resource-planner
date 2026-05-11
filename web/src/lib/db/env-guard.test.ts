import { describe, expect, it } from 'vitest';
import { assertSafeDbEnv } from './env-guard';

/**
 * #125: DynamoDB client 構築前の env 安全判定。
 *
 * Lambda 環境 (`AWS_LAMBDA_FUNCTION_NAME` 自動セット) または local endpoint (localhost / 127.0.0.1)
 * のいずれかでないと throw する。dev / preview / CI で env 注入失敗で本番 AWS に到達する事故を防ぐ。
 */
describe('assertSafeDbEnv (#125)', () => {
	it('allows Lambda environment (isLambda=true) regardless of endpoint', () => {
		expect(() => assertSafeDbEnv({ isLambda: true, endpoint: null })).not.toThrow();
		expect(() => assertSafeDbEnv({ isLambda: true, endpoint: undefined })).not.toThrow();
		expect(() =>
			assertSafeDbEnv({ isLambda: true, endpoint: 'https://dynamodb.ap-northeast-1.amazonaws.com' })
		).not.toThrow();
	});

	it('allows localhost endpoint when not in Lambda', () => {
		expect(() =>
			assertSafeDbEnv({ isLambda: false, endpoint: 'http://localhost:8000' })
		).not.toThrow();
	});

	it('allows 127.0.0.1 endpoint when not in Lambda', () => {
		expect(() =>
			assertSafeDbEnv({ isLambda: false, endpoint: 'http://127.0.0.1:8000' })
		).not.toThrow();
	});

	it('throws when endpoint is unset and not in Lambda', () => {
		expect(() => assertSafeDbEnv({ isLambda: false, endpoint: null })).toThrow(
			/Refusing to construct DynamoDB client/
		);
		expect(() => assertSafeDbEnv({ isLambda: false, endpoint: undefined })).toThrow();
		expect(() => assertSafeDbEnv({ isLambda: false, endpoint: '' })).toThrow();
	});

	it('throws when endpoint points to a non-localhost host and not in Lambda', () => {
		expect(() =>
			assertSafeDbEnv({
				isLambda: false,
				endpoint: 'https://dynamodb.ap-northeast-1.amazonaws.com'
			})
		).toThrow(/Refusing to construct DynamoDB client/);
	});

	it('error message includes the offending endpoint and the fix hint', () => {
		try {
			assertSafeDbEnv({ isLambda: false, endpoint: 'https://prod.example.com' });
			expect.fail('should have thrown');
		} catch (e) {
			expect(e).toBeInstanceOf(Error);
			const msg = (e as Error).message;
			expect(msg).toContain('https://prod.example.com');
			expect(msg).toContain('AWS_ENDPOINT_URL=http://localhost:8000');
			expect(msg).toContain('.env.local');
		}
	});

	it('rejects http://example.localhost-ish prefix bypass attempts', () => {
		// "http://localhost.evil.com" は host が evil.com で localhost ではない。正規表現が安全であることを確認。
		expect(() =>
			assertSafeDbEnv({ isLambda: false, endpoint: 'http://localhost.evil.com' })
		).toThrow();
	});
});
