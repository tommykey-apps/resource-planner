import { describe, expect, it } from 'vitest';
import { buildDynamoConfig } from './client-config';

/**
 * #235: SDK の env 自動検出に頼らず endpoint / credentials を明示注入する純粋ロジック。
 * dynamoClientConfig() の $env 読み + guard は env-guard.test.ts でカバー。
 */
describe('buildDynamoConfig (#235)', () => {
	it('endpoint あり → endpoint + region + credentials を明示注入する', () => {
		expect(
			buildDynamoConfig({
				endpoint: 'http://localhost:8000',
				region: 'ap-northeast-1',
				accessKeyId: 'local',
				secretAccessKey: 'local'
			})
		).toEqual({
			endpoint: 'http://localhost:8000',
			region: 'ap-northeast-1',
			credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
		});
	});

	it('endpoint あり / region・creds 未指定 → default region + dummy creds', () => {
		expect(buildDynamoConfig({ endpoint: 'http://localhost:8000' })).toEqual({
			endpoint: 'http://localhost:8000',
			region: 'ap-northeast-1',
			credentials: { accessKeyId: 'local', secretAccessKey: 'local' }
		});
	});

	it('endpoint なし (Lambda) → {} (SDK の IAM role / runtime region に委ねる)', () => {
		expect(buildDynamoConfig({})).toEqual({});
	});
});
