import { describe, expect, it } from 'vitest';
import { assertSafeDbEnv, detectLambda } from './env-guard';

/**
 * #125 / #135 / #143: DynamoDB client 構築前の env 安全判定。
 *
 * Lambda 環境 (3 つの env marker AND) または local endpoint (localhost / 127.x / [::1]) の
 * いずれかでないと throw する。 dev / preview / CI で env 注入失敗で AWS SDK が default
 * credential chain に落ちて本番 AWS に到達する事故を防ぐ。
 */
describe('detectLambda (#143)', () => {
	it('returns true when all 3 markers are set (real Lambda)', () => {
		expect(
			detectLambda({
				AWS_LAMBDA_FUNCTION_NAME: 'resource-planner',
				AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
				LAMBDA_TASK_ROOT: '/var/task'
			})
		).toBe(true);
	});

	it('returns false if any single marker is missing (paranoid AND)', () => {
		const base = {
			AWS_LAMBDA_FUNCTION_NAME: 'fn',
			AWS_EXECUTION_ENV: 'AWS_Lambda_nodejs22.x',
			LAMBDA_TASK_ROOT: '/var/task'
		};
		expect(detectLambda({ ...base, AWS_LAMBDA_FUNCTION_NAME: undefined })).toBe(false);
		expect(detectLambda({ ...base, AWS_EXECUTION_ENV: undefined })).toBe(false);
		expect(detectLambda({ ...base, LAMBDA_TASK_ROOT: undefined })).toBe(false);
	});

	it('returns false if AWS_EXECUTION_ENV does not start with AWS_Lambda_ (typo / fake)', () => {
		expect(
			detectLambda({
				AWS_LAMBDA_FUNCTION_NAME: 'fn',
				AWS_EXECUTION_ENV: 'AWS_Fargate_nodejs',
				LAMBDA_TASK_ROOT: '/var/task'
			})
		).toBe(false);
	});

	it('returns false for empty env', () => {
		expect(detectLambda({})).toBe(false);
	});
});

describe('assertSafeDbEnv', () => {
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

	it('allows IPv6 [::1] endpoint when not in Lambda (#143)', () => {
		expect(() =>
			assertSafeDbEnv({ isLambda: false, endpoint: 'http://[::1]:8000' })
		).not.toThrow();
	});

	it('allows any 127.x.x.x loopback (#143)', () => {
		expect(() =>
			assertSafeDbEnv({ isLambda: false, endpoint: 'http://127.1.2.3:8000' })
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

	it('rejects http://localhost.evil.com prefix bypass attempts', () => {
		expect(() =>
			assertSafeDbEnv({ isLambda: false, endpoint: 'http://localhost.evil.com' })
		).toThrow();
	});

	it('rejects non-http(s) schemes (#143、 file:// / data: 等 bypass 防止)', () => {
		expect(() =>
			assertSafeDbEnv({ isLambda: false, endpoint: 'file:///localhost' })
		).toThrow();
	});

	it('rejects malformed URL (parse failure)', () => {
		expect(() => assertSafeDbEnv({ isLambda: false, endpoint: 'not a url' })).toThrow();
	});
});
