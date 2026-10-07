import { fileURLToPath } from 'node:url';
import { build, type Plugin } from 'vite';

const MODULE_ID = 'virtual:tsumucode-react-preview-source';

/** 固定Reactを隔離iframe用の文字列へbuildする。管理UIへ実行moduleをimportしない。 */
export function reactPreviewSourcePlugin(): Plugin {
  let operation: Promise<string> | undefined;
  return {
    name: 'tsumucode-react-preview-source',
    resolveId(id) {
      return id === MODULE_ID ? '\0' + MODULE_ID : undefined;
    },
    async load(id) {
      if (id !== '\0' + MODULE_ID) return;
      operation ??= (async () => {
        const result = await build({
          configFile: false,
          publicDir: false,
          logLevel: 'warn',
          define: { 'process.env.NODE_ENV': '"production"' },
          build: {
            write: false,
            target: 'es2023',
            minify: true,
            rolldownOptions: {
              input: fileURLToPath(
                new URL('../../src/adapters/runtime/react/trustedRuntimeEntry.ts', import.meta.url),
              ),
              preserveEntrySignatures: 'strict',
              output: { inlineDynamicImports: true },
            },
          },
        });
        if (Array.isArray(result) || !('output' in result))
          throw new Error('React build形式が不正です');
        const chunks = result.output.filter((item) => item.type === 'chunk');
        const chunk = chunks[0];
        if (
          !chunk ||
          chunks.length !== 1 ||
          chunk.imports.length ||
          chunk.dynamicImports.length ||
          chunk.exports.sort().join(',') !==
            'Fragment,createContext,createRoot,jsx,jsxs,useContext,useEffect,useReducer,useRef,useState'
        )
          throw new Error('React bundleは固定exportだけの自己完結moduleである必要があります');
        return chunk.code;
      })();
      return 'export default ' + JSON.stringify(await operation) + ';';
    },
  };
}
