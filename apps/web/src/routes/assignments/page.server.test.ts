import { describe, expect, it } from 'vitest';
import { actions } from './+page.server';

/** 画面の form が送る action と、 ここで公開する action が一致することを固定する。 */
describe('/assignments の form actions', () => {
	it('公開する action', () => {
		expect(Object.keys(actions).sort()).toEqual([
			'createAssignment',
			'deleteAssignment',
			'updateAssignment'
		]);
	});
});
