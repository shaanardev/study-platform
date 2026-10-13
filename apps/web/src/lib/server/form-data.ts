export const getFormString = (formData: FormData, fieldName: string): string => {
  const value = formData.get(fieldName);
  return typeof value === 'string' ? value : '';
};
