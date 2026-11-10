// svelte-check は vite plugin を通らないので、 型検査の前に Paraglide JS の出力を生成する。
import { compile } from '@inlang/paraglide-js';
import { paraglideOptions } from '../paraglide.options.js';

await compile(paraglideOptions);
