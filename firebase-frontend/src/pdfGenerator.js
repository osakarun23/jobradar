import jsPDF from 'jspdf';

export const generateTailoredCVPDF = (cvContent, jobTitle, company) => {
  const doc = new jsPDF();
  const pageHeight = doc.internal.pageSize.getHeight();
  const pageWidth = doc.internal.pageSize.getWidth();
  const margin = 10;
  const maxWidth = pageWidth - 2 * margin;
  
  // Add header
  doc.setFontSize(14);
  doc.text(`Tailored Resume - ${jobTitle}`, margin, margin);
  doc.setFontSize(10);
  doc.text(`Company: ${company}`, margin, margin + 7);
  
  // Add CV content
  doc.setFontSize(11);
  const lines = doc.splitTextToSize(cvContent, maxWidth);
  let yPosition = margin + 15;
  
  lines.forEach((line) => {
    if (yPosition > pageHeight - margin) {
      doc.addPage();
      yPosition = margin;
    }
    doc.text(line, margin, yPosition);
    yPosition += 5;
  });
  
  // Save PDF
  doc.save(`${jobTitle}_${company}_resume.pdf`);
};
