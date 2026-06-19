export type LorebookPdfSection = {
  title: string;
  content?: string;
  period?: { from: string; to?: string | null };
};

export async function downloadLorebookPdf(
  bookTitle: string,
  sections: LorebookPdfSection[]
): Promise<void> {
  if (sections.length === 0) {
    throw new Error('No chapters to export');
  }

  const { default: jsPDF } = await import('jspdf');
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 20;
  const maxWidth = pageWidth - margin * 2;
  let yPosition = margin;

  const checkPageBreak = (requiredHeight: number) => {
    if (yPosition + requiredHeight > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
  };

  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  const titleLines = doc.splitTextToSize(bookTitle, maxWidth);
  doc.text(titleLines, margin, yPosition);
  yPosition += titleLines.length * 10 + 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(128, 128, 128);
  doc.text(`Generated on ${new Date().toLocaleDateString()}`, margin, yPosition);
  yPosition += 10;

  sections.forEach((section, idx) => {
    checkPageBreak(30);

    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(0, 0, 0);
    const sectionTitleLines = doc.splitTextToSize(section.title, maxWidth);
    doc.text(sectionTitleLines, margin, yPosition);
    yPosition += sectionTitleLines.length * 8 + 5;

    if (section.period) {
      checkPageBreak(10);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(128, 128, 128);
      const periodText = `${new Date(section.period.from).toLocaleDateString()} - ${
        section.period.to ? new Date(section.period.to).toLocaleDateString() : 'Present'
      }`;
      doc.text(periodText, margin, yPosition);
      yPosition += 8;
    }

    if (section.content) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(0, 0, 0);

      const paragraphs = section.content.split('\n\n').filter((p) => p.trim());
      paragraphs.forEach((paragraph) => {
        checkPageBreak(15);
        const cleanParagraph = paragraph
          .replace(/\*\*(.*?)\*\*/g, '$1')
          .replace(/\*(.*?)\*/g, '$1')
          .replace(/\[(.*?)\]\(.*?\)/g, '$1')
          .trim();

        if (cleanParagraph) {
          const contentLines = doc.splitTextToSize(cleanParagraph, maxWidth);
          doc.text(contentLines, margin, yPosition);
          yPosition += contentLines.length * 6 + 4;
        }
      });
    }

    if (idx < sections.length - 1) {
      checkPageBreak(15);
      yPosition += 5;
      doc.setDrawColor(200, 200, 200);
      doc.line(margin, yPosition, pageWidth - margin, yPosition);
      yPosition += 10;
    }
  });

  const date = new Date().toISOString().split('T')[0];
  const filename = `${bookTitle.toLowerCase().replace(/\s+/g, '-')}-${date}.pdf`;
  doc.save(filename);
}

/** Flatten memoir-style nested sections for PDF export. */
export function flattenMemoirSections(
  sections: Array<{
    title: string;
    content?: string;
    order?: number;
    period?: { from: string; to?: string | null };
    children?: Array<{ title: string; content?: string; order?: number; period?: { from: string; to?: string | null } }>;
  }>
): LorebookPdfSection[] {
  const result: LorebookPdfSection[] = [];
  const sorted = [...sections].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));

  for (const section of sorted) {
    result.push({
      title: section.title,
      content: section.content,
      period: section.period,
    });
    if (section.children?.length) {
      result.push(...flattenMemoirSections(section.children));
    }
  }
  return result;
}

/** Map server biography chapters to PDF sections. */
export function biographyToPdfSections(biography: {
  chapters?: Array<{
    title: string;
    text?: string;
    timeSpan?: { start: string; end?: string };
  }>;
}): LorebookPdfSection[] {
  return (biography.chapters ?? []).map((chapter) => ({
    title: chapter.title,
    content: chapter.text,
    period: chapter.timeSpan
      ? { from: chapter.timeSpan.start, to: chapter.timeSpan.end ?? null }
      : undefined,
  }));
}
