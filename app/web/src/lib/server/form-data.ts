import * as Schema from 'effect/Schema';

export const getFormString = (formData: FormData, fieldName: string): string => {
  const value = formData.get(fieldName);

  return Schema.is(Schema.String)(value) ? value : '';
};
