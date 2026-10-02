export const normalizeReviewedAnswer = (text: string): string => {
  const replacements: Array<[string, string]> = [
    ['Delta Live Tables (DLT)', 'Lakeflow Spark Declarative Pipelines'],
    ['Delta Live Tables', 'Lakeflow Spark Declarative Pipelines'],
    ['Databricks Workflows', 'Lakeflow Jobs'],
    ['Databricks Asset Bundles', 'Declarative Automation Bundles'],
    ['Databricks Asset Bundle', 'Declarative Automation Bundle'],
    ['Asset Bundles', 'Declarative Automation Bundles'],
    ['Asset Bundle', 'Declarative Automation Bundle'],
  ];
  for (const [before, after] of replacements) text = text.replaceAll(before, after);
  // Temporary content-specific normalization; the pack citation rebuild must decide whether these replacements belong in generated pack JSON or the pack-specific profile.
  return text.replace(/\bDLT\b/g, 'Lakeflow Spark Declarative Pipelines');
};
