// Local synthetic probe only; resolve extensionless relative imports to checked-out TypeScript.
export async function resolve(specifier, context, nextResolve) {
  if (specifier.endsWith('.json') && !context.importAttributes?.type) {
    const attributes = { ...context.importAttributes, type: 'json' };
    const result = await nextResolve(specifier, {
      ...context,
      importAttributes: attributes,
    });
    return { ...result, importAttributes: attributes };
  }
  try {
    return await nextResolve(specifier, context);
  } catch (error) {
    if (
      error?.code !== 'ERR_MODULE_NOT_FOUND' ||
      (!specifier.startsWith('./') && !specifier.startsWith('../')) ||
      /\.[a-z0-9]+$/iu.test(specifier)
    )
      throw error;
    return nextResolve(specifier + '.ts', context);
  }
}
