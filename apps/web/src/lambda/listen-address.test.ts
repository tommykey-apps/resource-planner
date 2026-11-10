import { describe, expect, it } from 'vitest';
import { parseListenAddress } from './listen-address';

/**
 * Lambda Web Functions は待ち受け先を AWS_LAMBDA_HTTP_ENDPOINT に "host:port" で渡す。
 * adapter-node は HOST と PORT を読むので、入口ファイルでこの2つに分ける。
 * Refs: https://docs.aws.amazon.com/lambda/latest/dg/web-functions-revisions-env-vars.html
 */
describe('parseListenAddress', () => {
	it('splits an IPv4 host and port', () => {
		expect(parseListenAddress('169.254.100.1:8080')).toEqual({
			host: '169.254.100.1',
			port: '8080'
		});
	});

	it('splits at the last colon so an IPv6 host keeps its colons', () => {
		expect(parseListenAddress('::1:8080')).toEqual({ host: '::1', port: '8080' });
	});

	it('throws when the value is missing', () => {
		expect(() => parseListenAddress(undefined)).toThrow('AWS_LAMBDA_HTTP_ENDPOINT');
		expect(() => parseListenAddress('')).toThrow('AWS_LAMBDA_HTTP_ENDPOINT');
	});

	it('throws when the port is missing or not a number', () => {
		expect(() => parseListenAddress('127.0.0.1')).toThrow('AWS_LAMBDA_HTTP_ENDPOINT');
		expect(() => parseListenAddress('127.0.0.1:')).toThrow('AWS_LAMBDA_HTTP_ENDPOINT');
		expect(() => parseListenAddress('127.0.0.1:http')).toThrow('AWS_LAMBDA_HTTP_ENDPOINT');
	});

	it('throws when the host is missing', () => {
		expect(() => parseListenAddress(':8080')).toThrow('AWS_LAMBDA_HTTP_ENDPOINT');
	});
});
