export interface ReportMeta {
  code: string;
  schemaVersion: string;
  dataSource: string;
  generatedAt: string;
}

export interface ReportBody {
  title: string;
  sections: Array<{ heading: string; content: string }>;
}

export function toMarkdown(meta: ReportMeta, body: ReportBody): string {
  const header = [
    `# ${body.title}`,
    "",
    `- code: ${meta.code}`,
    `- schema_version: ${meta.schemaVersion}`,
    `- data_source: ${meta.dataSource}`,
    `- generated_at: ${meta.generatedAt}`,
    "",
  ].join("\n");

  const sections = body.sections
    .map((s) => `## ${s.heading}\n\n${s.content}`)
    .join("\n\n");

  return `${header}${sections}\n`;
}
