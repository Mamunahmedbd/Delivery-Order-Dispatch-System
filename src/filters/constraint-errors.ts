/* eslint-disable @typescript-eslint/naming-convention */

export const constraintErrors: Record<string, string> = {
  // biome-ignore lint/style/useNamingConvention: legacy DB key
  UQ_users_email: 'error.unique.email',
};
