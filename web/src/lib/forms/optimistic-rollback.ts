/**
 * #140: optimistic create が server で失敗したとき、 dialog を即 close + form 入力を捨てる
 * のではなく、 **入力値を保持して dialog を再 open** + **server からの error message を表示** する。
 *
 * ロジックを純粋関数として切り出し、 ResourceManager / ProjectManager / AssignmentCreator
 * の rollback path で共通に呼べるようにする (将来 helper 化の起点)。
 */
import type { ServerError, ServerErrors } from './server-error';

export type RollbackRecoverInput<T extends { name?: string }> = {
	/** optimistic で生成した temp entity (rollback で元に戻す値の source) */
	temp: T;
	/** server から返ってきた failure data (`result.data`) */
	failureData: { errors?: ServerErrors } | undefined;
	/**
	 * `ServerError` を locale 済文字列に変換する関数。 component から
	 * `translateServerError` を渡す ($lib/i18n の reactive state に依存するため
	 * 純粋関数からは直接呼べない、 引数で受け取って合成性を保つ)。
	 */
	translate: (e: ServerError) => string;
	/**
	 * 該当 field の error が無いとき (network error 等) に表示する fallback。
	 * 通常 `t('errors.generic')` を渡す。
	 */
	fallback: string;
	/** error を引く form field 名 (例: 'name')。 */
	field: string;
};

export type RollbackRecoverOutput = {
	formName: string;
	formError: string;
};

/**
 * Rollback 時に form を復元する state を計算する純粋関数。
 *
 * - `formName`: temp.name (= ユーザーの最後の入力) を返す。 temp.name が undefined なら空文字。
 * - `formError`: server から該当 field の error code が来ていれば translate、 来ていなければ fallback。
 */
export function rollbackRecoverState<T extends { name?: string }>(
	opts: RollbackRecoverInput<T>
): RollbackRecoverOutput {
	const errs = opts.failureData?.errors;
	const fieldErr = errs?.[opts.field];
	return {
		formName: opts.temp.name ?? '',
		formError: fieldErr ? opts.translate(fieldErr) : opts.fallback
	};
}
