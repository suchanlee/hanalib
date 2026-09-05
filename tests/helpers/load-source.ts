import { readFileSync, existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, resolve, extname } from 'node:path';
import ts from 'typescript';
import { compileFunction } from 'node:vm';

const nativeRequire = createRequire(import.meta.url);
const root = resolve(import.meta.dirname, '../..');

// Load TSX and Worker entrypoints under Node, replacing only platform/external boundaries.
export function sourceLoader(mocks: Record<string, unknown> = {}) {
  const cache = new Map<string, { exports: unknown }>();
  function load<T>(filename: string): T {
    const path = resolve(root, filename);
    const previous = cache.get(path);
    if (previous) return previous.exports as T;
    const sourceModule = { exports: {} as unknown };
    cache.set(path, sourceModule);
    function requireSource(id: string): unknown {
      if (Object.hasOwn(mocks, id)) return mocks[id];
      if (!id.startsWith('.') && !id.startsWith('@/')) return nativeRequire(id);
      const base = id.startsWith('@/')
        ? resolve(root, id.slice(2))
        : resolve(dirname(path), id);
      const target = [
        base,
        `${base}.ts`,
        `${base}.tsx`,
        `${base}/index.ts`,
      ].find(
        (candidate) =>
          existsSync(candidate) &&
          ['.ts', '.tsx', '.json'].includes(extname(candidate)),
      );
      if (!target) throw new Error(`Unable to resolve ${id} from ${path}`);
      if (Object.hasOwn(mocks, target)) return mocks[target];
      if (target.endsWith('.json'))
        return JSON.parse(readFileSync(target, 'utf8'));
      return load(target);
    }
    const compiled = ts.transpileModule(readFileSync(path, 'utf8'), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
        jsx: ts.JsxEmit.ReactJSX,
        esModuleInterop: true,
      },
      fileName: path,
    }).outputText;
    const evaluate = compileFunction(
      compiled,
      ['require', 'module', 'exports'],
      { filename: path },
    );
    evaluate(requireSource, sourceModule, sourceModule.exports);
    return sourceModule.exports as T;
  }
  return load;
}
